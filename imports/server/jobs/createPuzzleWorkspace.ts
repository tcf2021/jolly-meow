import createPuzzleWorkspace from "../../lib/jobs/createPuzzleWorkspace";
import Hunts from "../../lib/models/Hunts";
import Puzzles from "../../lib/models/Puzzles";
import ensurePuzzleWorkspace from "../ensurePuzzleWorkspace";
import defineJob from "./framework/defineJob";

defineJob(createPuzzleWorkspace, {
  deleteAfter: () => new Date(Date.now() + 86400000),
  async run({ puzzleId }) {
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) return;
    if ((await Hunts.findOneAsync(puzzle.hunt))?.archived) return;
    try {
      const document = await ensurePuzzleWorkspace(puzzle);
      if (!document && (await Puzzles.findOneAsync(puzzleId)))
        throw new Error("Google workspace is not ready");
      await Puzzles.updateAsync(puzzleId, { $unset: { workspaceError: 1 } });
    } catch {
      await Puzzles.updateAsync(puzzleId, { $set: { workspaceError: true } });
      // Google errors may contain OAuth headers; retain only a public message.
      throw new Error("Google workspace creation failed; waiting to retry");
    }
  },
});
