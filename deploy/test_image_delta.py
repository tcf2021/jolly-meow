import hashlib
import importlib.util
import io
import json
import os
import pathlib
import tarfile
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("image_delta", pathlib.Path(__file__).with_name("image-delta.py"))
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)


def layer(files, timestamp):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size, member.mtime = len(data), timestamp
            archive.addfile(member, io.BytesIO(data))
        link = tarfile.TarInfo("app/current")
        link.type, link.linkname = tarfile.SYMTYPE, "program.js"
        archive.addfile(link)
    return buffer.getvalue()


def image(path, layers, oci=False):
    blobs = {"blobs/sha256/" + hashlib.sha256(data).hexdigest(): data for data in layers}
    config = json.dumps({"architecture": "amd64", "os": "linux", "rootfs": {
        "type": "layers", "diff_ids": ["sha256:" + hashlib.sha256(data).hexdigest() for data in layers],
    }}, sort_keys=True).encode()
    image_id = "sha256:" + hashlib.sha256(config).hexdigest()
    config_name = "blobs/sha256/" + image_id.removeprefix("sha256:")
    blobs[config_name] = config
    blobs["manifest.json"] = json.dumps([{"Config": config_name, "Layers": list(blobs)[:-1], "RepoTags": ["test:release"]}]).encode()
    if oci:
        document = json.dumps({"schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "config": {"digest": image_id, "size": len(config), "mediaType": "application/vnd.oci.image.config.v1+json"},
            "layers": [{"digest": "sha256:" + hashlib.sha256(data).hexdigest(), "size": len(data),
                        "mediaType": "application/vnd.oci.image.layer.v1.tar"} for data in layers]}, sort_keys=True).encode()
        image_id = "sha256:" + hashlib.sha256(document).hexdigest()
        blobs["blobs/sha256/" + image_id.removeprefix("sha256:")] = document
        blobs["index.json"] = json.dumps({"schemaVersion": 2, "manifests": [{"digest": image_id,
            "size": len(document), "mediaType": "application/vnd.oci.image.manifest.v1+json"}]}).encode()
        blobs["oci-layout"] = b'{"imageLayoutVersion":"1.0.0"}'
    with tarfile.open(path, "w:gz") as archive:
        for name, data in blobs.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return image_id


class ImageDeltaTest(unittest.TestCase):
    def test_oci_manifest_identity_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            base, target, index, patch, result = [root / n for n in ["base.gz", "target.gz", "index.gz", "delta.gz", "result.gz"]]
            common = layer({"runtime": b"node"}, 1)
            image(base, [common, layer({"app/main": b"old"}, 1)], oci=True)
            image_id = image(target, [common, layer({"app/main": b"new"}, 2)], oci=True)
            delta.prepare_index(base, index)
            info = delta.build_delta(target, index, patch, delta.digest(target), "c" * 40)
            self.assertEqual(info["imageId"], image_id)
            actual = delta.reconstruct(base, patch, result, info["deltaSha256"], image_id)
            self.assertEqual(actual["imageId"], image_id)

    def test_exact_image_with_changed_headers_new_and_deleted_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            base, target, index, patch, result = [root / n for n in ["base.gz", "target.gz", "index.gz", "delta.gz", "result.gz"]]
            unchanged = os.urandom(2 * 1024 * 1024)
            common = layer({"runtime": b"unchanged node runtime"}, 1)
            image(base, [common, layer({"init": b"directory setup"}, 1), layer({
                "app/node_modules/library": unchanged, "app/program.js": b"old program", "app/old-client.js": b"deleted",
            }, 1)])
            target_id = image(target, [common, layer({"init": b"directory setup"}, 2), layer({
                "app/node_modules/library": unchanged, "app/program.js": b"new program", "app/new-client.js": b"new asset",
            }, 2)])
            delta.prepare_index(base, index)
            info = delta.build_delta(target, index, patch, delta.digest(target), "a" * 40)
            self.assertGreaterEqual(info["reusedBytes"], len(unchanged))
            self.assertLess(info["deltaBytes"], target.stat().st_size // 10)
            actual = delta.reconstruct(base, patch, result, info["deltaSha256"], target_id)
            self.assertEqual(actual["imageId"], target_id)
            with tarfile.open(target, "r:gz") as expected, tarfile.open(result, "r:gz") as reconstructed:
                self.assertEqual(set(expected.getnames()), set(reconstructed.getnames()))
                for member in expected:
                    self.assertEqual(expected.extractfile(member).read(), reconstructed.extractfile(member.name).read())
            with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                delta.reconstruct(base, patch, root / "invalid.gz", "0" * 64, target_id)
            wrong_base = root / "wrong-base.gz"
            image(wrong_base, [common, layer({"other": b"different base"}, 1)])
            with self.assertRaisesRegex(ValueError, "Wrong base image"):
                delta.reconstruct(wrong_base, patch, root / "wrong.gz", info["deltaSha256"], target_id)

    def test_changed_runtime_requires_full_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            base, target, index = [root / n for n in ["base.gz", "target.gz", "index.gz"]]
            image(base, [layer({"node": os.urandom(1024 * 1024)}, 1), layer({"app/main": b"old"}, 1)])
            image(target, [layer({"node": os.urandom(1024 * 1024)}, 2), layer({"app/main": b"new"}, 2)])
            delta.prepare_index(base, index)
            with self.assertRaisesRegex(ValueError, "Base/dependency layers changed"):
                delta.build_delta(target, index, root / "delta.gz", delta.digest(target), "b" * 40)


if __name__ == "__main__":
    unittest.main()
