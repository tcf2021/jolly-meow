import { check } from "meteor/check";
import ChatMessages from "../../lib/models/ChatMessages";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import chatMessagesForPuzzle from "../../lib/publications/chatMessagesForPuzzle";
import definePublication from "./definePublication";

definePublication(chatMessagesForPuzzle, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      huntId: String,
    });
    return arg;
  },

  async run({ puzzleId, huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId)) {
      return [];
    }
    if ((await Hunts.findOneAsync(huntId))?.hasChat === false) return [];

    return ChatMessages.find({
      puzzle: puzzleId,
      hunt: huntId,
    });
  },
});
