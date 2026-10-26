import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Puzzles from "../../lib/models/Puzzles";
import { puzzleHasWhiteboard } from "../../lib/PuzzleDocumentTypes";
import syncWhiteboard from "../../methods/syncWhiteboard";
import { workspaceCleanupError } from "../puzzleWorkspaceCleanup";
import { syncWhiteboardPeer } from "../whiteboardRooms";
import {
  parseWhiteboardScene,
  WhiteboardPresenceSchema,
} from "../whiteboardSchema";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(syncWhiteboard, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      sessionId: String,
      scene: Match.Optional(String),
      presence: Match.Optional(Object),
      generation: Match.Optional(String),
    });
    const parsedPresence = arg.presence
      ? WhiteboardPresenceSchema.safeParse(arg.presence)
      : undefined;
    if (parsedPresence && !parsedPresence.success)
      throw new Meteor.Error(400, "协作状态格式不正确");
    return { ...arg, presence: parsedPresence?.data };
  },
  async run({ puzzleId, sessionId, scene, presence, generation }) {
    check(this.userId, String);
    if (!this.connection) throw new Meteor.Error(403, "白板需要实时连接");
    const userId = this.userId;
    const connectionId = this.connection.id;
    await withLock(`whiteboard:${puzzleId}`, async () => {
      const puzzle = await Puzzles.findOneAsync(puzzleId);
      if (
        !puzzle ||
        !puzzleHasWhiteboard(puzzle) ||
        puzzle.whiteboardGeneration !== generation
      )
        throw workspaceCleanupError(403, "whiteboardUnavailable");
      syncWhiteboardPeer(
        puzzleId,
        sessionId,
        userId,
        connectionId,
        scene === undefined ? undefined : parseWhiteboardScene(scene),
        presence,
        generation,
      );
    });
  },
});
