import { assert } from "chai";
import mergeWhiteboardScene from "../../../../imports/lib/mergeWhiteboardScene";

describe("whiteboard scene merging", function () {
  it("preserves teammates' additions when an older client saves", function () {
    const mine = { id: "mine", version: 1, versionNonce: 2 };
    const theirs = { id: "theirs", version: 1, versionNonce: 3 };
    const result = mergeWhiteboardScene(
      { elements: [mine, theirs], files: {} },
      { elements: [mine], files: {} },
    );
    assert.deepEqual(result.elements, [mine, theirs]);
  });
  it("does not revive a deleted element from a stale client", function () {
    const deleted = {
      id: "shape",
      version: 2,
      versionNonce: 7,
      isDeleted: true,
    };
    const result = mergeWhiteboardScene(
      { elements: [deleted], files: {} },
      { elements: [{ id: "shape", version: 1, versionNonce: 9 }], files: {} },
    );
    assert.deepEqual(result.elements, [deleted]);
  });
  it("resolves equal-version edits consistently in either order", function () {
    const first = {
      elements: [{ id: "shape", version: 3, versionNonce: 2, x: 1 }],
      files: {},
    };
    const second = {
      elements: [{ id: "shape", version: 3, versionNonce: 8, x: 2 }],
      files: {},
    };
    assert.deepEqual(
      mergeWhiteboardScene(first, second),
      mergeWhiteboardScene(second, first),
    );
  });
  it("retains image files from both editors", function () {
    const merged = mergeWhiteboardScene(
      { elements: [], files: { a: { dataURL: "first" } } },
      { elements: [], files: { b: { dataURL: "second" } } },
    );
    assert.hasAllKeys(merged.files, ["a", "b"]);
  });
  it("orders layers by Excalidraw fractional indices after a remote reorder", function () {
    const first = { id: "first", version: 1, versionNonce: 2, index: "a0" };
    const second = { id: "second", version: 1, versionNonce: 3, index: "a1" };
    const moved = { ...first, version: 2, index: "a2" };
    assert.deepEqual(
      mergeWhiteboardScene(
        { elements: [first, second], files: {} },
        { elements: [moved], files: {} },
      ).elements,
      [second, moved],
    );
  });
});
