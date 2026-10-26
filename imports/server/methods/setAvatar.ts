import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import {
  AVATAR_DATA_PREFIX,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_DATA_LENGTH,
} from "../../lib/avatar";
import MeteorUsers from "../../lib/models/MeteorUsers";
import setAvatar from "../../methods/setAvatar";
import defineMethod from "./defineMethod";

defineMethod(setAvatar, {
  validate(arg) {
    check(arg, { avatar: Match.OneOf(String, null) });
    return arg;
  },
  async run({ avatar }) {
    if (!this.userId) throw new Meteor.Error(401, "Not logged in");
    if (avatar === null) {
      await MeteorUsers.updateAsync(this.userId, {
        $unset: { avatarUrl: "" },
      });
      return;
    }
    if (
      avatar.length > MAX_AVATAR_DATA_LENGTH ||
      !avatar.startsWith(AVATAR_DATA_PREFIX)
    ) {
      throw new Meteor.Error(400, "Invalid avatar image");
    }
    const encoded = avatar.slice(AVATAR_DATA_PREFIX.length);
    const bytes = Buffer.from(encoded, "base64");
    if (
      bytes.length < 4 ||
      bytes.length > MAX_AVATAR_BYTES ||
      bytes.toString("base64") !== encoded ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9
    ) {
      throw new Meteor.Error(400, "Invalid avatar image");
    }
    await MeteorUsers.updateAsync(this.userId, {
      $set: { avatarUrl: avatar },
    });
  },
});
