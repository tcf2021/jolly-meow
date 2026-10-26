import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import purgePuzzleJob from "../../lib/jobs/purgePuzzle";
import Hunts from "../../lib/models/Hunts";
import Jobs from "../../lib/models/Jobs";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import purgePuzzle from "../../methods/purgePuzzle";
import enqueueJob from "../jobs/framework/enqueueJob";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(purgePuzzle, {
  validate(arg) {
    check(arg, { puzzleId: String, confirmationTitle: String });
    return arg;
  },
  async run({ puzzleId, confirmationTitle }) {
    check(this.userId, String);
    const userId = this.userId;
    await withLock(`puzzle:${puzzleId}:edit`, async () => {
      const puzzle = await Puzzles.findOneDeletedAsync(puzzleId);
      if (!puzzle) throw new Meteor.Error(404, "Deleted puzzle not found");
      if (
        !userMayWritePuzzlesForHunt(
          await MeteorUsers.findOneAsync(userId),
          await Hunts.findOneAsync(puzzle.hunt),
        )
      )
        throw new Meteor.Error(403, "Not authorized to purge this puzzle");
      if (confirmationTitle !== puzzle.title)
        throw new Meteor.Error(400, "Puzzle title does not match");
      const pending = await Jobs.findOneAsync({
        type: purgePuzzleJob.name,
        "args.puzzleId": puzzleId,
        status: { $in: ["pending", "running"] },
      });
      if (!pending)
        await enqueueJob(purgePuzzleJob, { puzzleId, huntId: puzzle.hunt });
      await Puzzles.updateAsync(puzzleId, {
        $set: { purging: true },
        $unset: { purgeError: 1 },
      });
    });
  },
});
