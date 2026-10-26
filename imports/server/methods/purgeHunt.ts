import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import purgeHunt from "../../lib/jobs/purgeHunt";
import Hunts from "../../lib/models/Hunts";
import Jobs from "../../lib/models/Jobs";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import purgeHuntMethod from "../../methods/purgeHunt";
import enqueueJob from "../jobs/framework/enqueueJob";
import withLock from "../withLock";
import defineMethod from "./defineMethod";

defineMethod(purgeHuntMethod, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },

  async run({ huntId }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    await withLock(`hunt:${huntId}:delete`, async () => {
      if (!(await Hunts.findOneAllowingDeletedAsync(huntId)))
        throw new Meteor.Error(404, "Hunt not found");
      const pending = await Jobs.findOneAsync({
        type: purgeHunt.name,
        "args.huntId": huntId,
        status: { $in: ["pending", "running"] },
      });
      if (!pending) await enqueueJob(purgeHunt, { huntId });
    });
  },
});
