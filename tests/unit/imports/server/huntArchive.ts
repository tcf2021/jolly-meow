import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import Hints from "../../../../imports/lib/models/Hints";
import Hunts from "../../../../imports/lib/models/Hunts";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Tags from "../../../../imports/lib/models/Tags";
import {
  userMayJoinCallsForHunt,
  userMayUpdateHunt,
  userMayWritePuzzlesForHunt,
} from "../../../../imports/lib/permission_stubs";
import { checkMethodHuntArchive } from "../../../../imports/server/huntArchive";

describe("archived hunt writes", () => {
  afterEach(() => sinon.restore());
  const rejectsArchived = async (name: string, args: unknown) => {
    try {
      await checkMethodHuntArchive(name, args);
      assert.fail("Write should be blocked");
    } catch (error) {
      assert.instanceOf(error, Meteor.Error);
      assert.equal(error.error, 403);
    }
  };
  it("blocks edits for administrators while leaving voice access available", () => {
    const user = { roles: { __GLOBAL__: ["admin"] }, hunts: ["hunt"] };
    const hunt = { _id: "hunt", archived: true };
    assert.isFalse(userMayWritePuzzlesForHunt(user, hunt));
    assert.isFalse(userMayUpdateHunt(user, hunt));
    assert.isTrue(userMayJoinCallsForHunt(user, hunt));
    assert.isTrue(
      userMayWritePuzzlesForHunt(user, { ...hunt, archived: false }),
    );
  });
  it("uses the actual puzzle hunt, including deleted puzzles, rather than a supplied hunt ID", async () => {
    sinon
      .stub(Puzzles, "findOneAllowingDeletedAsync")
      .resolves({ _id: "p", hunt: "archived" } as any);
    const find = sinon
      .stub(Hunts, "findOneAsync")
      .resolves({ archived: true } as any);
    await rejectsArchived("Puzzles.methods.undestroy", {
      puzzleId: "p",
      huntId: "active",
    });
    await rejectsArchived("Guesses.method.create", { puzzleId: "p" });
    assert.equal(find.firstCall.args[0], "archived");
  });
  it("freezes tags and hint responses using their stored activity IDs", async () => {
    sinon.stub(Hunts, "findOneAsync").resolves({ archived: true } as any);
    sinon.stub(Tags, "findOneAsync").resolves({ hunt: "archived" } as any);
    sinon.stub(Hints, "findOneAsync").resolves({ huntId: "archived" } as any);
    await rejectsArchived("Tags.methods.rename", { tagId: "t" });
    await rejectsArchived("jrHints.updateField", { hintId: "h" });
  });
  it("allows whiteboard collaboration, Sheet images, bookmarks and unarchiving", async () => {
    const find = sinon
      .stub(Hunts, "findOneAsync")
      .resolves({ archived: true } as any);
    for (const name of [
      "Whiteboards.methods.save",
      "Whiteboards.methods.sync",
      "Documents.methods.insertImage",
      "Documents.methods.createImageUpload",
      "Documents.methods.listSheets",
      "Puzzles.methods.bookmark",
      "Hunts.methods.setArchived",
    ])
      await checkMethodHuntArchive(name, { huntId: "archived", puzzleId: "p" });
    assert.isFalse(find.called);
  });
  it("resumes normal mutation after unarchiving", async () => {
    const find = sinon.stub(Hunts, "findOneAsync");
    find.onFirstCall().resolves({ archived: true } as any);
    find.onSecondCall().resolves({ archived: false } as any);
    await rejectsArchived("Hunts.methods.update", { huntId: "hunt" });
    await checkMethodHuntArchive("Hunts.methods.update", { huntId: "hunt" });
  });
});
