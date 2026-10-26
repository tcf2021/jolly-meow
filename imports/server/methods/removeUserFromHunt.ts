import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayRemoveUserFromHunt } from "../../lib/permission_stubs";
import removeUserFromHunt from "../../methods/removeUserFromHunt";
import defineMethod from "./defineMethod";

defineMethod(removeUserFromHunt, {
  validate(arg) {
    check(arg, {
      targetUserId: String,
      huntId: String,
    });
    return arg;
  },

  async run({ targetUserId, huntId }) {
    check(this.userId, String);

    if (
      !userMayRemoveUserFromHunt(
        await MeteorUsers.findOneAsync(this.userId),
        await Hunts.findOneAsync(huntId),
      )
    ) {
      throw new Meteor.Error(
        401,
        "Must be operator to remove a user from the hunt.",
      );
    }

    const targetUser = await MeteorUsers.findOneAsync(targetUserId);
    if (!targetUser) {
      throw new Meteor.Error(404, "User not found");
    }

    Logger.info("Removing user from the hunt", {
      user: targetUserId,
      operator: this.userId,
    });

    await MeteorUsers.updateAsync(targetUserId, {
      $pull: { hunts: huntId },
    });
  },
});
