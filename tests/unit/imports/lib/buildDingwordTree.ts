import { assert } from "chai";
import buildDingwordTree from "../../../../imports/lib/buildDingwordTree";

describe("keyword tree initialization", function () {
  it("provides a nonselectable root in an empty database", function () {
    const { nodes, rootNodeId } = buildDingwordTree([]);
    assert.equal(rootNodeId, "__root__");
    assert.deepEqual(nodes.get(rootNodeId)?.children, []);
    assert.isFalse(nodes.get(rootNodeId)?.selectable);
  });
  it("keeps orphaned legacy keywords reachable without changing source arrays", function () {
    const words = [
      { _id: "root", name: "__root__", children: ["category"] },
      { _id: "category", name: "Science", children: ["leaf"] },
      { _id: "leaf", name: "Chemistry" },
      { _id: "orphan", name: "Music" },
    ];
    const { nodes, rootNodeId } = buildDingwordTree(words);
    assert.equal(rootNodeId, "root");
    assert.deepEqual(nodes.get("root")?.children, ["category", "orphan"]);
    assert.deepEqual(nodes.get("category")?.children, ["leaf"]);
    assert.deepEqual(words[0]?.children, ["category"]);
  });
  it("removes deleted, duplicate and self references from the visible tree", function () {
    const { nodes } = buildDingwordTree([
      {
        _id: "root",
        name: "__root__",
        children: ["root", "deleted", "leaf", "leaf"],
      },
      { _id: "leaf", name: "Music", children: ["leaf", "root"] },
    ]);
    assert.deepEqual(nodes.get("root")?.children, ["leaf"]);
    assert.deepEqual(nodes.get("leaf")?.children, []);
  });
});
