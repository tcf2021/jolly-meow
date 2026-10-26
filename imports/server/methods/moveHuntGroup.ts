import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import moveGroupOrder from "../../lib/moveGroupOrder";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import { puzzleGroupsByRelevance } from "../../lib/puzzle-sort-and-group";
import moveHuntGroup from "../../methods/moveHuntGroup";
import withRenewedLock from "../withRenewedLock";
import defineMethod from "./defineMethod";

defineMethod(moveHuntGroup, {
  validate(arg) {
    check(arg, {
      huntId: String,
      tagId: String,
      direction: Match.OneOf("up", "down"),
      neighborTagId: Match.Optional(String),
    });
    return arg;
  },
  async run({ huntId, tagId, direction, neighborTagId }) {
    check(this.userId, String);
    const user = await MeteorUsers.findOneAsync(this.userId);
    return withRenewedLock(`hunt:${huntId}:group-order`, async () => {
      const hunt = await Hunts.findOneAsync(huntId);
      if (!userMayWritePuzzlesForHunt(user, hunt))
        throw new Meteor.Error(403, "Cannot reorder this hunt");
      const tags = await Tags.find({ hunt: huntId }).fetchAsync();
      if (!tags.some((t) => t._id === tagId && t.name.startsWith("group:")))
        throw new Meteor.Error(404, "Unknown group");
      const puzzles = await Puzzles.find({ hunt: huntId }).fetchAsync();
      const groups = puzzleGroupsByRelevance(puzzles, tags, hunt?.groupOrder);
      const order = moveGroupOrder(groups, tagId, direction, neighborTagId);
      if (order)
        await Hunts.updateAsync(
          { _id: huntId, archived: { $ne: true } },
          { $set: { groupOrder: order } },
        );
    });
  },
});
