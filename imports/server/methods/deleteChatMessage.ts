import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import ChatMessages from "../../lib/models/ChatMessages";
import deleteChatMessage from "../../methods/deleteChatMessage";
import defineMethod from "./defineMethod";

defineMethod(deleteChatMessage, {
  validate(arg) {
    check(arg, {
      messageId: String,
      puzzleId: String,
      huntId: String,
    });

    return arg;
  },

  async run({
    messageId,
    puzzleId,
    huntId,
  }: {
    messageId: string;
    puzzleId: string;
    huntId: string;
  }) {
    check(this.userId, String);

    const user = await Meteor.users.findOneAsync(this.userId);

    if (!user?.hunts?.includes(huntId)) {
      return;
    }

    const message = await ChatMessages.findOneAsync({
      _id: messageId,
      puzzle: puzzleId,
      hunt: huntId,
    });

    if (!message || message.sender !== this.userId) {
      return;
    }

    await ChatMessages.removeAsync({
      _id: messageId,
      puzzle: puzzleId,
      hunt: huntId,
    });
  },
});
