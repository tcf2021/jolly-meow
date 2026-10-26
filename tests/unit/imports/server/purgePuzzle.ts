import { Random } from "meteor/random";
import { assert } from "chai";
import Bookmarks from "../../../../imports/lib/models/Bookmarks";
import ChatMessages, {
  contentFromMessage,
} from "../../../../imports/lib/models/ChatMessages";
import ChatNotifications from "../../../../imports/lib/models/ChatNotifications";
import Documents from "../../../../imports/lib/models/Documents";
import Hunts from "../../../../imports/lib/models/Hunts";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import { purgePuzzleData } from "../../../../imports/server/jobs/purgePuzzle";

describe("permanent puzzle deletion", function () {
  it("removes archived puzzle data, preserves its hunt and other puzzles, and can resume", async function () {
    const huntId = Random.id(),
      puzzleId = Random.id(),
      otherId = Random.id(),
      userId = Random.id();
    try {
      await Hunts.insertAsync({
        _id: huntId,
        name: "Purge fixture",
        hasGuessQueue: false,
        createdBy: userId,
      });
      for (const id of [puzzleId, otherId]) {
        await Puzzles.insertAsync({
          _id: id,
          hunt: huntId,
          title: "Fixture",
          answers: [],
          expectedAnswerCount: 1,
          createdBy: userId,
        });
        await Documents.insertAsync({
          hunt: huntId,
          puzzle: id,
          provider: "excalidraw",
          value: { type: "excalidraw", id },
          createdBy: userId,
        });
        await ChatMessages.insertAsync({
          hunt: huntId,
          puzzle: id,
          content: contentFromMessage("fixture"),
          timestamp: new Date(),
          createdBy: userId,
        });
        await ChatNotifications.insertAsync({
          hunt: huntId,
          puzzle: id,
          user: userId,
          sender: userId,
          content: contentFromMessage("fixture"),
          timestamp: new Date(),
          createdBy: userId,
        });
        await Bookmarks.insertAsync({
          hunt: huntId,
          puzzle: id,
          user: userId,
          createdBy: userId,
        });
        await Whiteboards.insertAsync({
          _id: id,
          hunt: huntId,
          scene: '{"elements":[],"files":{}}',
          createdBy: userId,
        });
      }
      await Puzzles.destroyAsync(puzzleId);
      await ChatMessages.destroyAsync({ puzzle: puzzleId });
      await purgePuzzleData(puzzleId, huntId);
      await purgePuzzleData(puzzleId, huntId);
      assert.isUndefined(await Puzzles.findOneAllowingDeletedAsync(puzzleId));
      assert.isUndefined(
        await Documents.findOneAllowingDeletedAsync({ puzzle: puzzleId }),
      );
      assert.isUndefined(
        await ChatMessages.findOneAllowingDeletedAsync({ puzzle: puzzleId }),
      );
      assert.isUndefined(
        await ChatNotifications.findOneAllowingDeletedAsync({
          puzzle: puzzleId,
        }),
      );
      assert.isUndefined(
        await Bookmarks.findOneAllowingDeletedAsync({ puzzle: puzzleId }),
      );
      assert.isUndefined(await Whiteboards.findOneAsync(puzzleId));
      assert.isDefined(await Hunts.findOneAsync(huntId));
      assert.isDefined(await Puzzles.findOneAsync(otherId));
      assert.isDefined(await ChatMessages.findOneAsync({ puzzle: otherId }));
      assert.isDefined(
        await ChatNotifications.findOneAsync({ puzzle: otherId }),
      );
    } finally {
      await Promise.all([
        Bookmarks.removeAsync({ hunt: huntId }),
        ChatMessages.removeAsync({ hunt: huntId }),
        ChatNotifications.removeAsync({ hunt: huntId }),
        Documents.removeAsync({ hunt: huntId }),
        Whiteboards.removeAsync({ hunt: huntId }),
        Puzzles.removeAsync({ hunt: huntId }),
      ]);
      await Hunts.removeAsync(huntId);
    }
  });

  it("rejects permanently deleting an active puzzle", async function () {
    const id = Random.id(),
      huntId = Random.id(),
      userId = Random.id();
    await Puzzles.insertAsync({
      _id: id,
      hunt: huntId,
      title: "Active fixture",
      answers: [],
      expectedAnswerCount: 1,
      createdBy: userId,
    });
    try {
      try {
        await purgePuzzleData(id, huntId);
        assert.fail("An active puzzle must be retained");
      } catch (error) {
        assert.match((error as Error).message, /Only deleted/);
      }
      assert.isDefined(await Puzzles.findOneAsync(id));
    } finally {
      await Puzzles.removeAsync(id);
    }
  });
});
