import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import sendChatMessage from "../../methods/sendChatMessage";
import sendChatMessageInternal from "../sendChatMessageInternal";
import defineMethod from "./defineMethod";

defineMethod(sendChatMessage, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      content: String,
      parentId: Match.Optional(Match.OneOf(String, null)),
    });

    return arg;
  },

  async run({
    puzzleId,
    content,
    parentId = null,
  }: {
    puzzleId: string;
    content: string;
    parentId?: string | null;
  }) {
    check(this.userId, String);
    const puzzle = await Puzzles.findOneAsync(puzzleId);
    const hunt = puzzle && (await Hunts.findOneAsync(puzzle.hunt));
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!hunt || !user?.hunts?.includes(hunt._id)) {
      throw new Meteor.Error(403, "You are not a member of this hunt");
    }
    if (hunt?.hasChat === false)
      throw new Meteor.Error(400, "Chat is disabled for this hunt");
    const contentObj = JSON.parse(content);
    check(contentObj, {
      type: "message" as const,
      children: [
        Match.OneOf(
          {
            type: "mention" as const,
            userId: String,
          },
          {
            type: "role-mention" as const,
            roleId: "operator" as const,
          },
          {
            type: "dingword" as const,
            dingwordId: String,
          },
          {
            type: "image" as const,
            url: String,
          },
          {
            text: String,
          },
        ),
      ],
    });

    await sendChatMessageInternal({
      puzzleId,
      content: contentObj,
      sender: this.userId,
      parentId: parentId ?? null,
    });
  },
});
