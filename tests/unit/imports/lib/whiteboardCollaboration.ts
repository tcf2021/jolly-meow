import { assert } from "chai";
import {
  whiteboardSceneDelta,
  whiteboardSceneSignature,
  captureWhiteboardScene,
} from "../../../../imports/lib/whiteboardCollaboration";

describe("whiteboard live updates", function () {
  it("captures independent snapshots of mutable drag geometry", function () {
    const element = {
      id: "shape",
      version: 1,
      versionNonce: 2,
      points: [[0, 0]],
    };
    const before = captureWhiteboardScene(
      { elements: [], files: {} },
      [element],
      {},
    );
    element.version = 2;
    element.points[0]![0] = 20;
    const after = captureWhiteboardScene(before, [element], {});
    assert.equal(before.elements[0]!.version, 1);
    assert.deepEqual(before.elements[0]!.points, [[0, 0]]);
    assert.lengthOf(whiteboardSceneDelta(before, after).elements, 1);
  });
  it("sends only edits and new images, including deletion tombstones", function () {
    const unchanged = { id: "keep", version: 1, versionNonce: 2 };
    const before = {
      elements: [unchanged, { id: "delete", version: 1, versionNonce: 3 }],
      files: { old: { dataURL: "old" } },
    };
    const deleted = {
      id: "delete",
      version: 2,
      versionNonce: 4,
      isDeleted: true,
    };
    const added = { id: "new", version: 1, versionNonce: 5 };
    const after = {
      elements: [unchanged, deleted, added],
      files: { ...before.files, new: { dataURL: "new" } },
    };
    assert.deepEqual(whiteboardSceneDelta(before, after), {
      elements: [deleted, added],
      files: { new: after.files.new },
    });
  });
  it("sends a same-version conflict winner", function () {
    assert.lengthOf(
      whiteboardSceneDelta(
        { elements: [{ id: "shape", version: 2, versionNonce: 9 }], files: {} },
        { elements: [{ id: "shape", version: 2, versionNonce: 1 }], files: {} },
      ).elements,
      1,
    );
  });
  it("does not send an unchanged scene", function () {
    const scene = {
      elements: [{ id: "shape", version: 1, versionNonce: 2 }],
      files: {},
    };
    assert.deepEqual(whiteboardSceneDelta(scene, scene), {
      elements: [],
      files: {},
    });
  });
  it("recognizes a saved scene independently of subscription arrival order", function () {
    const a = { id: "a", version: 1, versionNonce: 2 };
    const b = { id: "b", version: 2, versionNonce: 3 };
    assert.equal(
      whiteboardSceneSignature({ elements: [a, b], files: { a: {}, b: {} } }),
      whiteboardSceneSignature({ elements: [b, a], files: { b: {}, a: {} } }),
    );
  });
});
