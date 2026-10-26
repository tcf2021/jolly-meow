import Hints from "../../lib/models/Hints";
import Puzzles from "../../lib/models/Puzzles";
import { computeSolvedness } from "../../lib/solvedness";
import type Hookset from "./Hookset";

const HintAutoCloseHooks: Hookset = {
  name: "HintAutoCloseHooks",
  async onPuzzleSolved(puzzleId: string) {
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    if (!puzzle) {
      return;
    }

    if (computeSolvedness(puzzle) !== "solved") {
      return;
    }

    const now = new Date();
    await Hints.updateAsync(
      { puzzleId, status: { $ne: "cancelled" } },
      {
        $set: {
          status: "autoClosed",
          updatedAt: now,
          statusChangedAt: now,
        },
      },
      { multi: true },
    );
  },
};

export default HintAutoCloseHooks;
