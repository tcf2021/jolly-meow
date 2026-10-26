import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import Whiteboards from "../../lib/models/Whiteboards";
import { puzzleHasWhiteboard } from "../../lib/PuzzleDocumentTypes";

Meteor.publish(
  "whiteboardForPuzzle",
  async function (params: { puzzleId: string }) {
    check(params, { puzzleId: String });
    const { puzzleId } = params;
    if (!this.userId) return [];
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (
      !puzzle ||
      !puzzleHasWhiteboard(puzzle) ||
      !user?.hunts?.includes(puzzle.hunt)
    )
      return [];
    return Whiteboards.find({ _id: puzzleId });
  },
);
