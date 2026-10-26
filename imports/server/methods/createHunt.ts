import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Flags from "../../Flags";
import Logger from "../../Logger";
import { DEFAULT_HUNT_TAGS } from "../../lib/defaultHuntTags";
import Hunts, { HuntPattern } from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { addUserToRole, checkAdmin } from "../../lib/permission_stubs";
import validateHuntInput from "../../lib/validateHuntInput";
import createHunt from "../../methods/createHunt";
import addUsersToDiscordRole from "../addUsersToDiscordRole";
import { ensureHuntFolder } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import GoogleClient from "../googleClientRefresher";
import defineMethod from "./defineMethod";

defineMethod(createHunt, {
  validate(arg) {
    check(arg, HuntPattern);
    return validateHuntInput(arg);
  },

  async run(arg) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    Logger.info("Creating a new hunt", arg);

    const huntId = await Hunts.insertAsync(arg);
    await addUserToRole(this.userId, huntId, "operator");

    for (const tag of DEFAULT_HUNT_TAGS) {
      await getOrCreateTagByName(huntId, tag);
    }

    Meteor.defer(async () => {
      try {
        // External services are optional and must not crash the local app.
        const userIds = (
          await MeteorUsers.find({ hunts: huntId }).fetchAsync()
        ).map((u) => u._id);
        await addUsersToDiscordRole(userIds, huntId);
        if (
          GoogleClient.ready() &&
          !(await Flags.activeAsync("disable.google"))
        ) {
          await ensureHuntFolder({ _id: huntId, name: arg.name });
        }
      } catch (error) {
        Logger.warn("Failed to sync external services for hunt", {
          huntId,
          error,
        });
      }
    });

    return huntId;
  },
});
