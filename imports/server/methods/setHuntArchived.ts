import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import setHuntArchived from "../../methods/setHuntArchived";
import { scheduleHuntDocumentIndex } from "../automaticHuntDocumentIndex";
import defineMethod from "./defineMethod";

defineMethod(setHuntArchived, {
  validate(arg) {
    check(arg, { huntId: String, archived: Boolean });
    return arg;
  },
  async run({ huntId, archived }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));
    const hunt = await Hunts.findOneAsync(huntId);
    if (!hunt) throw new Meteor.Error(404, "Unknown hunt");
    if (Boolean(hunt.archived) === archived) return;
    await Hunts.updateAsync(
      huntId,
      archived
        ? { $set: { archived: true, archivedAt: new Date() } }
        : { $set: { archived: false }, $unset: { archivedAt: 1 } },
    );
    if (!archived) scheduleHuntDocumentIndex(huntId);
  },
});
