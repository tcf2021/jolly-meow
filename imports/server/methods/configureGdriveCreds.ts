import { check } from "meteor/check";
import { Google } from "meteor/google-oauth";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import { userMayConfigureGdrive } from "../../lib/permission_stubs";
import configureGdriveCreds from "../../methods/configureGdriveCreds";
import defineMethod from "./defineMethod";

defineMethod(configureGdriveCreds, {
  validate(arg) {
    check(arg, {
      key: String,
      secret: String,
    });
    return arg;
  },

  async run({ key, secret }) {
    check(this.userId, String);

    if (!userMayConfigureGdrive(await MeteorUsers.findOneAsync(this.userId))) {
      throw new Meteor.Error(401, "Must be admin to configure gdrive");
    }

    const credential = await Google.retrieveCredential(key, secret);
    if (!credential?.serviceData) {
      throw new Meteor.Error(400, "Google 授权已失效，请重新绑定管理账号");
    }
    const { refreshToken, email, id } = credential.serviceData;
    if (!refreshToken || !email || !id) {
      throw new Meteor.Error(
        400,
        "未获得 Google 离线授权。请重新绑定并完成授权；必要时在 Google 账号中移除该应用授权后重试。",
      );
    }
    Logger.info("Updating Gdrive creds", { email });
    await Settings.upsertAsync(
      { name: "gdrive.credential" },
      { $set: { value: { refreshToken, email, id } } },
    );
  },
});
