#!/usr/bin/env python3
"""Transfer Docker image updates without retransmitting unchanged app files.

Uses only Python 3.11+ standard-library modules. The resulting image keeps the
original config and layer digests; this does not rebuild the application.
"""

import argparse
import gzip
import hashlib
import json
import pathlib
import shutil
import tarfile
import tempfile


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(path, expected):
    require(digest(path) == expected.removeprefix("sha256:"), "Checksum mismatch")


def manifest(archive):
    items = json.load(archive.extractfile("manifest.json"))
    require(len(items) == 1, "Expected a single-image Docker archive")
    item = items[0]
    config_bytes = archive.extractfile(item["Config"]).read()
    config = json.loads(config_bytes)
    require(len(item["Layers"]) == len(config["rootfs"]["diff_ids"]), "Layer mismatch")
    return item, config, "sha256:" + hashlib.sha256(config_bytes).hexdigest()


def image_identity(archive, config_id):
    # Docker's classic store identifies an image by its config. The containerd
    # store uses the OCI manifest digest. Preserve and verify both identities.
    if "index.json" not in archive.getnames():
        return config_id
    index = json.load(archive.extractfile("index.json"))
    require(len(index.get("manifests", [])) == 1, "Expected a single-platform OCI image")
    descriptor = index["manifests"][0]
    image_id = descriptor["digest"]
    blob = archive.extractfile("blobs/sha256/" + image_id.removeprefix("sha256:")).read()
    require("sha256:" + hashlib.sha256(blob).hexdigest() == image_id, "OCI manifest checksum mismatch")
    require(json.loads(blob)["config"]["digest"] == config_id, "OCI config reference mismatch")
    return image_id


def extract_layer(archive, name, destination, expected):
    with archive.extractfile(name) as stream, open(destination, "wb") as output:
        shutil.copyfileobj(stream, output)
    # Docker save currently exports uncompressed layer blobs. Fail explicitly
    # on other formats instead of producing a patch against compressed bytes.
    verify(destination, expected)


def prepare_index(image, output):
    with tempfile.TemporaryDirectory(prefix="jollymeow-index-") as scratch:
        layer_path = pathlib.Path(scratch) / "app.tar"
        with tarfile.open(image, "r:gz") as archive:
            item, config, config_id = manifest(archive)
            image_id = image_identity(archive, config_id)
            extract_layer(archive, item["Layers"][-1], layer_path, config["rootfs"]["diff_ids"][-1])
        files = {}
        with tarfile.open(layer_path, "r:") as layer:
            for member in layer:
                if member.isfile() and member.size:
                    with layer.extractfile(member) as stream:
                        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
                    files[member.name] = [checksum, member.offset_data, member.size]
        index = {"version": 1, "imageId": image_id, "diffIds": config["rootfs"]["diff_ids"], "files": files}
        with gzip.open(output, "wt", encoding="utf8") as stream:
            json.dump(index, stream, separators=(",", ":"))
    return {"imageId": image_id, "files": len(files), "indexBytes": output.stat().st_size}


def build_delta(image, index_path, output, source_sha256, commit):
    verify(image, source_sha256)
    with gzip.open(index_path, "rt", encoding="utf8") as stream:
        index = json.load(stream)
    require(index.get("version") == 1, "Unsupported base index")
    with tempfile.TemporaryDirectory(prefix="jollymeow-delta-") as scratch:
        root = pathlib.Path(scratch)
        app_path, patch_path = root / "app.tar", root / "patch.bin"
        metadata_path = root / "target-metadata.tar"
        with tarfile.open(image, "r:gz") as archive:
            item, config, config_id = manifest(archive)
            image_id = image_identity(archive, config_id)
            diffs = config["rootfs"]["diff_ids"]
            shared = 0
            for old, new in zip(index["diffIds"][:-1], diffs[:-1]):
                if old != new:
                    break
                shared += 1
            common = item["Layers"][:shared]
            # Large changed dependency/base layers should use a full release.
            require(all(archive.getmember(n).size < 1024 * 1024 for n in item["Layers"][shared:-1]),
                    "Base/dependency layers changed; deploy the complete image")
            app_name = item["Layers"][-1]
            extract_layer(archive, app_name, app_path, diffs[-1])
            with tarfile.open(metadata_path, "w:") as metadata:
                for member in archive.getmembers():
                    if member.name not in common and member.name != app_name:
                        metadata.addfile(member, archive.extractfile(member) if member.isfile() else None)

        ops, cursor, reused = [], 0, 0
        with open(app_path, "rb") as source, open(patch_path, "wb") as patch, tarfile.open(app_path, "r:") as layer:
            def add_patch(start, end):
                if end <= start:
                    return
                offset = patch.tell()
                source.seek(start)
                remaining = end - start
                while remaining:
                    data = source.read(min(remaining, 1024 * 1024))
                    require(bool(data), "Truncated target layer")
                    patch.write(data)
                    remaining -= len(data)
                ops.append({"patch": offset, "size": end - start})

            for member in layer:
                old = index["files"].get(member.name)
                if not (member.isfile() and member.size and old and old[2] == member.size):
                    continue
                with layer.extractfile(member) as stream:
                    checksum = hashlib.file_digest(stream, "sha256").hexdigest()
                if checksum == old[0]:
                    add_patch(cursor, member.offset_data)
                    ops.append({"old": old[1], "size": member.size})
                    cursor = member.offset_data + member.size
                    reused += member.size
            add_patch(cursor, app_path.stat().st_size)

        instructions = {
            "version": 1, "commit": commit, "sourceSha256": source_sha256,
            "baseImageId": index["imageId"], "imageId": image_id,
            "configId": config_id,
            "app": app_name, "appDigest": diffs[-1], "appBytes": app_path.stat().st_size,
            "common": common, "config": item["Config"], "ops": ops,
        }
        (root / "ops.json").write_text(json.dumps(instructions, separators=(",", ":")), encoding="utf8")
        with tarfile.open(output, "w:gz", compresslevel=1) as archive:
            for name in ["patch.bin", "ops.json", "target-metadata.tar"]:
                archive.add(root / name, arcname=name)
    return {"commit": commit, "baseImageId": index["imageId"], "imageId": image_id,
            "deltaSha256": digest(output), "deltaBytes": output.stat().st_size, "reusedBytes": reused}


def reconstruct(base_image, delta, output, delta_sha256, expected_image_id):
    verify(delta, delta_sha256)
    with tempfile.TemporaryDirectory(prefix="jollymeow-apply-") as scratch:
        root = pathlib.Path(scratch)
        with tarfile.open(delta, "r:gz") as archive:
            require(archive.getnames() == ["patch.bin", "ops.json", "target-metadata.tar"], "Unexpected delta contents")
            # Never extract paths supplied by an archive into the filesystem.
            for name in archive.getnames():
                with archive.extractfile(name) as source, open(root / name, "wb") as target:
                    shutil.copyfileobj(source, target)
        info = json.loads((root / "ops.json").read_text(encoding="utf8"))
        require(info.get("version") == 1 and info["imageId"] == expected_image_id, "Unexpected target image")
        with tarfile.open(base_image, "r:gz") as archive:
            item, config, config_id = manifest(archive)
            image_id = image_identity(archive, config_id)
            require(image_id == info["baseImageId"], "Wrong base image; generate a fresh index")
            extract_layer(archive, item["Layers"][-1], root / "old.tar", config["rootfs"]["diff_ids"][-1])

        old_size, patch_size = (root / "old.tar").stat().st_size, (root / "patch.bin").stat().st_size
        with open(root / "old.tar", "rb") as old, open(root / "patch.bin", "rb") as patch, open(root / "new.tar", "wb") as target:
            total = 0
            for op in info["ops"]:
                require(set(op) in ({"old", "size"}, {"patch", "size"}), "Invalid delta operation")
                source, limit = (old, old_size) if "old" in op else (patch, patch_size)
                start, size = op.get("old", op.get("patch")), op["size"]
                require(isinstance(start, int) and isinstance(size, int) and 0 <= start <= limit and 0 <= size <= limit - start,
                        "Delta operation exceeds source bounds")
                total += size
                require(total <= info["appBytes"], "Delta exceeds target size")
                source.seek(start)
                while size:
                    data = source.read(min(size, 1024 * 1024))
                    require(bool(data), "Truncated delta source")
                    target.write(data)
                    size -= len(data)
        require((root / "new.tar").stat().st_size == info["appBytes"], "Incomplete target layer")
        verify(root / "new.tar", info["appDigest"])
        with tarfile.open(root / "target-metadata.tar", "r:") as metadata:
            config_bytes = metadata.extractfile(info["config"]).read()
            config_id = "sha256:" + hashlib.sha256(config_bytes).hexdigest()
            require(config_id == info["configId"], "Target config checksum mismatch")
            require(image_identity(metadata, config_id) == expected_image_id, "Target image identity mismatch")
        with tarfile.open(output, "w:gz", compresslevel=1) as target:
            with tarfile.open(root / "target-metadata.tar", "r:") as metadata:
                for member in metadata:
                    target.addfile(member, metadata.extractfile(member) if member.isfile() else None)
            with tarfile.open(base_image, "r:gz") as base:
                found = set()
                for member in base:
                    if member.name in info["common"]:
                        target.addfile(member, base.extractfile(member))
                        found.add(member.name)
                require(found == set(info["common"]), "Missing shared layer")
            target.add(root / "new.tar", arcname=info["app"])
    return {"commit": info["commit"], "imageId": expected_image_id,
            "imageSha256": digest(output), "imageBytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    index = commands.add_parser("index")
    index.add_argument("--image", type=pathlib.Path, required=True)
    index.add_argument("--output", type=pathlib.Path, required=True)
    build = commands.add_parser("build")
    build.add_argument("--image", type=pathlib.Path, required=True)
    build.add_argument("--index", type=pathlib.Path, required=True)
    build.add_argument("--source-sha256", required=True)
    build.add_argument("--commit", required=True)
    build.add_argument("--output", type=pathlib.Path, required=True)
    apply = commands.add_parser("reconstruct")
    apply.add_argument("--base-image", type=pathlib.Path, required=True)
    apply.add_argument("--delta", type=pathlib.Path, required=True)
    apply.add_argument("--delta-sha256", required=True)
    apply.add_argument("--image-id", required=True)
    apply.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    inputs = [getattr(args, n, None) for n in ["image", "index", "base_image", "delta"]]
    require(all(args.output.resolve() != p.resolve() for p in inputs if p is not None), "Output would overwrite an input")
    require(not args.output.exists(), "Output already exists; choose a new release path")
    if args.command == "index":
        result = prepare_index(args.image, args.output)
    elif args.command == "build":
        result = build_delta(args.image, args.index, args.output, args.source_sha256, args.commit)
    else:
        result = reconstruct(args.base_image, args.delta, args.output, args.delta_sha256, args.image_id)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
