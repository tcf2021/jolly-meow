import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import undestroyPuzzle from "../../methods/undestroyPuzzle";
import { pendingDriveSync } from "../driveLifecycle";
import withRenewedLock from "../withRenewedLock";
import defineMethod from "./defineMethod";

defineMethod(undestroyPuzzle, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
    });
    return arg;
  },

  async run({ puzzleId }) {
    check(this.userId, String);
    const userId = this.userId;
    return withRenewedLock(`puzzle:${puzzleId}:edit`, async () => {
      const puzzle = await Puzzles.findOneDeletedAsync(puzzleId);
      if (!puzzle) {
        throw new Meteor.Error(404, "Unknown puzzle id");
      }
      if (puzzle.purging)
        throw new Meteor.Error(409, "Puzzle is being permanently deleted");
      if (
        !userMayWritePuzzlesForHunt(
          await MeteorUsers.findOneAsync(userId),
          await Hunts.findOneAsync(puzzle.hunt),
        )
      ) {
        throw new Meteor.Error(
          401,
          `User ${this.userId} may not modify puzzles from hunt ${puzzle.hunt}`,
        );
      }

      await Puzzles.updateAsync(puzzleId, {
        $set: {
          deleted: false,
          driveSync: pendingDriveSync(),
        },
        $unset: {
          replacedBy: 1,
        },
      });
    });
  },
});
