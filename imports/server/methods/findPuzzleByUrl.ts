import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Puzzles from "../../lib/models/Puzzles";
import findPuzzleByUrl from "../../methods/findPuzzleByUrl";
import defineMethod from "./defineMethod";

defineMethod(findPuzzleByUrl, {
  validate(arg) {
    check(arg, {
      puzzleUrl: String,
    });
    return arg;
  },

  async run({ puzzleUrl }) {
    const existingPuzzleWithUrl = await Puzzles.findOneAsync({
      url: decodeURIComponent(puzzleUrl),
    });

    if (!existingPuzzleWithUrl) {
      throw new Meteor.Error(404, `No puzzle with URL ${puzzleUrl} found`);
    } else {
      return existingPuzzleWithUrl._id;
    }
  },
});
