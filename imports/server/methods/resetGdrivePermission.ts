import { check } from "meteor/check";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import resetGdrivePermission from "../../methods/resetGdrivePermission";
import { ensureHuntFolderPermission } from "../gdrive";
import defineMethod from "./defineMethod";

defineMethod(resetGdrivePermission, {
  validate(arg) {
    check(arg, {
      huntId: String,
    });

    return arg;
  },
  async run({ huntId }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));

    Logger.info("resetting Google Drive permission");

    for await (const user of MeteorUsers.find({
      hunts: huntId,
      googleAccount: { $exists: true },
    })) {
      await ensureHuntFolderPermission(huntId, user._id, user.googleAccount!);
    }
  },
});
