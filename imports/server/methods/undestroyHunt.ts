import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import purgeHunt from "../../lib/jobs/purgeHunt";
import Hunts from "../../lib/models/Hunts";
import Jobs from "../../lib/models/Jobs";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import undestroyHunt from "../../methods/undestroyHunt";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(undestroyHunt, {
  validate(arg) {
    check(arg, {
      huntId: String,
    });
    return arg;
  },

  async run({ huntId }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    await withLock(`hunt:${huntId}:index`, async () => {
      if (
        await Jobs.findOneAsync({ type: purgeHunt.name, "args.huntId": huntId })
      )
        throw new Meteor.Error(
          409,
          "Permanently deleted hunts cannot be restored",
        );
      await Hunts.undestroyAsync(huntId);
    });
  },
});
