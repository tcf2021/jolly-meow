import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import Hunts from "../../../../imports/lib/models/Hunts";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import Whiteboards from "../../../../imports/lib/models/Whiteboards";
import { clearDisabledPuzzleWhiteboard } from "../../../../imports/server/puzzleWorkspaceCleanup";
import {
  discardHuntWhiteboardRooms,
  getWhiteboardRoom,
  joinWhiteboardRoom,
  mergeLiveWhiteboard,
} from "../../../../imports/server/whiteboardRooms";

describe("whiteboard background persistence", function () {
  it("saves a new scene outside a user method and records subsequent editors", async function () {
    this.timeout(10000);
    const puzzleId = Random.id();
    const huntId = Random.id();
    const creator = Random.id();
    const editor = Random.id();
    const scene = (version: number) => ({
      elements: [{ id: "shape", version, versionNonce: version }],
      files: {},
    });
    const waitForVersion = async (version: number) => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const saved = await Whiteboards.findOneAsync(puzzleId);
        if (saved && JSON.parse(saved.scene).elements[0]?.version === version)
          return saved;
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
      throw new Error("Background whiteboard save did not complete");
    };
    try {
      await Hunts.insertAsync({
        _id: huntId,
        name: "Whiteboard persistence fixture",
        hasGuessQueue: false,
        createdBy: creator,
      });
      await Puzzles.insertAsync({
        _id: puzzleId,
        hunt: huntId,
        title: "Whiteboard fixture",
        answers: [],
        expectedAnswerCount: 1,
        hasWhiteboard: true,
        createdBy: creator,
      });
      await getWhiteboardRoom(puzzleId, huntId);
      mergeLiveWhiteboard(puzzleId, scene(1), creator);
      const inserted = await waitForVersion(1);
      assert.equal(inserted.createdBy, creator);
      assert.equal(inserted.hunt, huntId);

      await getWhiteboardRoom(puzzleId, huntId);
      mergeLiveWhiteboard(puzzleId, scene(2), editor);
      const updated = await waitForVersion(2);
      assert.equal(updated.createdBy, creator);
      assert.equal(updated.updatedBy, editor);
    } finally {
      await discardHuntWhiteboardRooms(huntId);
      await Whiteboards.removeAsync(puzzleId);
      await Puzzles.removeAsync(puzzleId);
      await Hunts.removeAsync(huntId);
    }
  });

  it("does not recreate a purged whiteboard when a delayed save fires", async function () {
    const huntId = Random.id();
    const puzzleId = Random.id();
    const editorId = Random.id();
    await Hunts.insertAsync({
      _id: huntId,
      name: "Purge fixture",
      hasGuessQueue: false,
      createdBy: editorId,
    });
    await Puzzles.insertAsync({
      _id: puzzleId,
      hunt: huntId,
      title: "Purge fixture",
      answers: [],
      expectedAnswerCount: 1,
      hasWhiteboard: true,
      createdBy: editorId,
    });
    await getWhiteboardRoom(puzzleId, huntId);
    mergeLiveWhiteboard(
      puzzleId,
      { elements: [{ id: "pending", version: 1, versionNonce: 1 }], files: {} },
      editorId,
    );
    await discardHuntWhiteboardRooms(huntId);
    await Puzzles.removeAsync(puzzleId);
    await Hunts.removeAsync(huntId);
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    assert.isUndefined(await Whiteboards.findOneAsync(puzzleId));
  });

  it("deletes drawings and images and starts empty when re-enabled, despite an old peer leaving", async function () {
    this.timeout(10000);
    const huntId = Random.id(),
      puzzleId = Random.id(),
      editorId = Random.id();
    const sub = {
      connection: { id: Random.id() },
      added: sinon.spy(),
      changed: sinon.spy(),
      removed: sinon.spy(),
    };
    try {
      await Hunts.insertAsync({
        _id: huntId,
        name: "Cleanup fixture",
        hasGuessQueue: false,
        createdBy: editorId,
      });
      await Puzzles.insertAsync({
        _id: puzzleId,
        hunt: huntId,
        title: "Cleanup fixture",
        answers: [],
        expectedAnswerCount: 1,
        hasWhiteboard: true,
        createdBy: editorId,
      });
      await Whiteboards.insertAsync({
        _id: puzzleId,
        hunt: huntId,
        scene: JSON.stringify({
          elements: [{ id: "old", version: 1, versionNonce: 1 }],
          files: { image: { dataURL: "old image" } },
        }),
        createdBy: editorId,
      });
      const oldRoom = await getWhiteboardRoom(puzzleId, huntId);
      const leave = joinWhiteboardRoom(
        oldRoom,
        sub as any,
        "old-session",
        editorId,
        "QA",
      );
      mergeLiveWhiteboard(
        puzzleId,
        {
          elements: [{ id: "pending", version: 1, versionNonce: 1 }],
          files: {},
        },
        editorId,
      );
      const generation = Random.id();
      await Puzzles.updateAsync(puzzleId, {
        $set: { hasWhiteboard: false, whiteboardGeneration: generation },
      });
      await clearDisabledPuzzleWhiteboard(puzzleId);
      await Puzzles.updateAsync(puzzleId, { $set: { hasWhiteboard: true } });
      const room = await getWhiteboardRoom(puzzleId, huntId);
      assert.deepEqual(room.scene, { elements: [], files: {} });
      leave();
      assert.strictEqual(await getWhiteboardRoom(puzzleId, huntId), room);
      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });
      assert.isUndefined(await Whiteboards.findOneAsync(puzzleId));
    } finally {
      await discardHuntWhiteboardRooms(huntId);
      await Whiteboards.removeAsync(puzzleId);
      await Puzzles.removeAsync(puzzleId);
      await Hunts.removeAsync(huntId);
    }
  });

  it("rejects background snapshots from before a clear even after re-enabling", async function () {
    this.timeout(10000);
    const huntId = Random.id(),
      puzzleId = Random.id(),
      editorId = Random.id();
    try {
      await Hunts.insertAsync({
        _id: huntId,
        name: "Generation fixture",
        hasGuessQueue: false,
        createdBy: editorId,
      });
      await Puzzles.insertAsync({
        _id: puzzleId,
        hunt: huntId,
        title: "Generation fixture",
        answers: [],
        expectedAnswerCount: 1,
        hasWhiteboard: true,
        createdBy: editorId,
      });
      await getWhiteboardRoom(puzzleId, huntId);
      mergeLiveWhiteboard(
        puzzleId,
        { elements: [{ id: "old", version: 1, versionNonce: 1 }], files: {} },
        editorId,
      );
      // Simulate another worker clearing the scene and rotating the generation.
      await Puzzles.updateAsync(puzzleId, {
        $set: { hasWhiteboard: false, whiteboardGeneration: Random.id() },
      });
      await Whiteboards.removeAsync(puzzleId);
      await Puzzles.updateAsync(puzzleId, { $set: { hasWhiteboard: true } });
      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });
      assert.isUndefined(await Whiteboards.findOneAsync(puzzleId));
      assert.deepEqual((await getWhiteboardRoom(puzzleId, huntId)).scene, {
        elements: [],
        files: {},
      });
    } finally {
      await discardHuntWhiteboardRooms(huntId);
      await Whiteboards.removeAsync(puzzleId);
      await Puzzles.removeAsync(puzzleId);
      await Hunts.removeAsync(huntId);
    }
  });
});
