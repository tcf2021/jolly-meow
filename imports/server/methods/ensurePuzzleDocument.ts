import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Flags from "../../Flags";
import Documents from "../../lib/models/Documents";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import ensurePuzzleDocument from "../../methods/ensurePuzzleDocument";
import ensurePuzzleWorkspace from "../ensurePuzzleWorkspace";
import { ensureHuntFolderPermission } from "../gdrive";
import defineMethod from "./defineMethod";

defineMethod(ensurePuzzleDocument, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
    });
    return arg;
  },

  async run({ puzzleId }) {
    check(this.userId, String);

    const user = (await MeteorUsers.findOneAsync(this.userId))!;
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle || !user.hunts?.includes(puzzle.hunt)) {
      throw new Meteor.Error(404, "Unknown puzzle");
    }

    this.unblock();

    let document;
    try {
      const archived = (await Hunts.findOneAsync(puzzle.hunt))?.archived;
      document = archived
        ? await Documents.findOneAsync({ puzzle: puzzleId })
        : await ensurePuzzleWorkspace(puzzle);
      if (!archived && puzzle.workspaceError)
        await Puzzles.updateAsync(puzzleId, { $unset: { workspaceError: 1 } });
    } catch (error) {
      if (!(await Hunts.findOneAsync(puzzle.hunt))?.archived)
        await Puzzles.updateAsync(puzzleId, { $set: { workspaceError: true } });
      throw error;
    }
    if (document?.provider !== "google") return;

    if (await Flags.activeAsync("disable.google")) {
      return;
    }

    if (await Flags.activeAsync("disable.gdrive_permissions")) {
      return;
    }

    if (user.googleAccount) {
      await ensureHuntFolderPermission(
        puzzle.hunt,
        this.userId,
        user.googleAccount,
      );
    }
  },
});
