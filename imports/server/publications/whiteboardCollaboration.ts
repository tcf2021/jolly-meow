import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import {
  puzzleHasWhiteboard,
  whiteboardPuzzleSelector,
} from "../../lib/PuzzleDocumentTypes";
import { getWhiteboardRoom, joinWhiteboardRoom } from "../whiteboardRooms";

Meteor.publish(
  "whiteboardCollaboration",
  async function (params: { puzzleId: string; sessionId: string }) {
    check(params, { puzzleId: String, sessionId: String });
    const { puzzleId, sessionId } = params;
    if (!this.userId || !/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) return [];
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (
      !puzzle ||
      !puzzleHasWhiteboard(puzzle) ||
      !user?.hunts?.includes(puzzle.hunt) ||
      !(await Hunts.findOneAsync(puzzle.hunt))
    )
      return [];
    let stopped = false;
    let leave: (() => void) | undefined;
    const watches: Meteor.LiveQueryHandle[] = [];
    this.onStop(() => {
      stopped = true;
      leave?.();
      watches.forEach((watch) => {
        watch.stop();
      });
    });
    const revoke = () => {
      if (!stopped) this.error(new Meteor.Error(403, "你已无法访问此白板"));
    };
    const authorizationCursors: Mongo.Cursor<any>[] = [
      Puzzles.find({ _id: puzzleId, ...whiteboardPuzzleSelector }),
      Hunts.find({ _id: puzzle.hunt }),
      MeteorUsers.find({ _id: this.userId, hunts: puzzle.hunt }),
    ];
    for (const cursor of authorizationCursors) {
      let authorized = false;
      const watch = await cursor.observeChangesAsync({
        added() {
          authorized = true;
        },
        removed: revoke,
      });
      if (!authorized) revoke();
      if (stopped) {
        watch.stop();
        return undefined;
      }
      watches.push(watch);
    }
    const room = await getWhiteboardRoom(puzzleId, puzzle.hunt);
    if (stopped) return undefined;
    const currentPuzzle = await Puzzles.findOneAsync(puzzleId);
    if (
      !currentPuzzle ||
      !puzzleHasWhiteboard(currentPuzzle) ||
      currentPuzzle.whiteboardGeneration !== room.generation ||
      room.discarded
    ) {
      revoke();
      return undefined;
    }
    leave = joinWhiteboardRoom(
      room,
      this,
      sessionId,
      this.userId,
      user.displayName ?? "队员",
    );
    this.ready();
    return undefined;
  },
);
