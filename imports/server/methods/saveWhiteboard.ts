import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import mergeWhiteboardScene from "../../lib/mergeWhiteboardScene";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import Whiteboards from "../../lib/models/Whiteboards";
import { puzzleHasWhiteboard } from "../../lib/PuzzleDocumentTypes";
import saveWhiteboard from "../../methods/saveWhiteboard";
import { workspaceCleanupError } from "../puzzleWorkspaceCleanup";
import { mergeLiveWhiteboard } from "../whiteboardRooms";
import { parseWhiteboardScene } from "../whiteboardSchema";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(saveWhiteboard, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      scene: String,
      generation: Match.Optional(String),
    });
    if (arg.scene.length > 6 * 1024 * 1024)
      throw new Meteor.Error(413, "白板内容过大，请减少图片或图形");
    return arg;
  },
  async run({ puzzleId, scene, generation }) {
    check(this.userId, String);
    const editorId = this.userId;
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (
      !puzzle ||
      !puzzleHasWhiteboard(puzzle) ||
      !user?.hunts?.includes(puzzle.hunt)
    ) {
      throw new Meteor.Error(403, "你没有权限编辑此白板");
    }
    await withLock(`whiteboard:${puzzleId}`, async () => {
      const currentPuzzle = await Puzzles.findOneAsync(puzzleId);
      if (
        !currentPuzzle ||
        !puzzleHasWhiteboard(currentPuzzle) ||
        currentPuzzle.whiteboardGeneration !== generation
      )
        throw workspaceCleanupError(403, "whiteboardUnavailable");
      const incoming = mergeLiveWhiteboard(
        puzzleId,
        parseWhiteboardScene(scene),
        editorId,
        generation,
      );
      const saved = await Whiteboards.findOneAsync(puzzleId);
      const current = saved
        ? parseWhiteboardScene(saved.scene)
        : { elements: [], files: {} };
      const merged = JSON.stringify(mergeWhiteboardScene(current, incoming));
      if (merged.length > 6 * 1024 * 1024)
        throw new Meteor.Error(413, "白板内容过大，请减少图片或图形");
      if (saved)
        await Whiteboards.updateAsync(puzzleId, {
          $set: { scene: merged, updatedBy: editorId },
        });
      else
        await Whiteboards.insertAsync({
          _id: puzzleId,
          hunt: puzzle.hunt,
          scene: merged,
          createdBy: editorId,
        });
    });
  },
});
