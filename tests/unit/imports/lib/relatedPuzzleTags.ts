import { assert } from "chai";
import { relatedPuzzleTags } from "../../../../imports/lib/relatedPuzzleTags";

describe("meta tag region popovers", function () {
  const names = [
    "is:meta",
    "is:metameta",
    "group:A",
    "meta-for:A",
    "group:B",
    "meta-for:B",
    "needs:aha",
  ];
  const tags = names.map((name) => ({ _id: name, name }));
  const meta = tags[0]!;
  const related = (owner: string[]) =>
    relatedPuzzleTags(meta, tags, { tags: owner }).map((tag) => tag.name);

  it("shows the current region instead of every meta in the hunt", function () {
    assert.deepEqual(related(["is:meta", "group:A"]), ["group:A"]);
  });
  it("prefers the regions fed into a meta over its parent region", function () {
    assert.deepEqual(related(["is:meta", "meta-for:A", "group:B"]), [
      "group:A",
    ]);
  });
  it("supports metas with more than one feeder region", function () {
    assert.deepEqual(related(["is:meta", "meta-for:A", "meta-for:B"]), [
      "group:A",
      "group:B",
    ]);
  });
  it("does not accidentally select other regions when the matching group is missing", function () {
    assert.deepEqual(related(["is:meta", "meta-for:missing"]), []);
  });
  it("keeps ordinary tag and meta-for popovers working", function () {
    assert.deepEqual(
      relatedPuzzleTags(tags[3]!, tags).map((tag) => tag.name),
      ["group:A"],
    );
    assert.deepEqual(
      relatedPuzzleTags(tags[6]!, tags).map((tag) => tag.name),
      ["needs:aha"],
    );
    assert.deepEqual(
      relatedPuzzleTags(meta, tags).map((tag) => tag.name),
      ["is:meta"],
    );
  });
});
