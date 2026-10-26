import { assert } from "chai";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";
import type { TagType } from "../../../../imports/lib/models/Tags";
import moveGroupOrder from "../../../../imports/lib/moveGroupOrder";
import {
  type PuzzleGroup,
  puzzleGroupsByRelevance,
} from "../../../../imports/lib/puzzle-sort-and-group";

const tag = (id: string, name = `group:${id}`): TagType =>
  ({
    _id: id,
    name,
    hunt: "hunt",
    createdAt: new Date(0),
    deleted: false,
  }) as TagType;
const group = (id: string, subgroups: PuzzleGroup[] = []): PuzzleGroup => ({
  sharedTag: tag(id),
  puzzles: [],
  subgroups,
});
const puzzle = (id: string, tags: string[], solved = false): PuzzleType =>
  ({
    _id: id,
    hunt: "hunt",
    title: id,
    tags,
    expectedAnswerCount: 1,
    answers: solved ? ["ANSWER"] : [],
    createdAt: new Date(0),
    deleted: false,
  }) as PuzzleType;

describe("manual group ordering", () => {
  it("keeps explicit order when a round becomes solved", () => {
    const tags = [tag("a"), tag("b")];
    const puzzles = [puzzle("a-p", ["a"], true), puzzle("b-p", ["b"])];
    assert.deepEqual(
      puzzleGroupsByRelevance(puzzles, tags).map((g) => g.sharedTag?._id),
      ["b", "a"],
    );
    assert.deepEqual(
      puzzleGroupsByRelevance(puzzles, tags, ["a", "b"]).map(
        (g) => g.sharedTag?._id,
      ),
      ["a", "b"],
    );
    tags[0]!.name = "group:renamed";
    assert.equal(
      puzzleGroupsByRelevance(puzzles, tags, ["a", "b"])[0]?.sharedTag?._id,
      "a",
    );
  });
  it("keeps administrivia above ordered groups, new groups last, and ungrouped puzzles below", () => {
    const tags = [tag("a"), tag("b"), tag("c"), tag("admin", "administrivia")];
    const puzzles = tags.map((t) => puzzle(`${t._id}-p`, [t._id]));
    puzzles.push(puzzle("no-group", []));
    assert.deepEqual(
      puzzleGroupsByRelevance(puzzles, tags, ["b", "a"]).map(
        (g) => g.sharedTag?._id,
      ),
      ["admin", "b", "a", "c", undefined],
    );
  });
  it("moves only siblings, including nested groups, and respects boundaries", () => {
    const groups = [group("parent", [group("a"), group("b")]), group("other")];
    assert.deepEqual(moveGroupOrder(groups, "b", "up"), [
      "parent",
      "b",
      "a",
      "other",
    ]);
    assert.isUndefined(moveGroupOrder(groups, "a", "up"));
    assert.isUndefined(moveGroupOrder(groups, "a", "down", "other"));
    assert.deepEqual(moveGroupOrder(groups, "other", "up"), [
      "other",
      "a",
      "b",
      "parent",
    ]);
  });
  it("can swap visible neighbors without discarding filtered groups", () => {
    const groups = [group("a"), group("hidden"), group("b")];
    assert.deepEqual(moveGroupOrder(groups, "b", "up", "a"), [
      "b",
      "hidden",
      "a",
    ]);
    assert.isUndefined(moveGroupOrder(groups, "a", "up", "b"));
  });
});
