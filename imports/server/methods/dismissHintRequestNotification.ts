import { check } from "meteor/check";
import HintRequestNotifications from "../../lib/models/HintRequestNotifications";
import dismissHintRequestNotification from "../../methods/dismissHintRequestNotification";
import defineMethod from "./defineMethod";

defineMethod(dismissHintRequestNotification, {
  validate(arg) {
    check(arg, { hintRequestNotificationId: String });
    return arg;
  },

  async run({ hintRequestNotificationId }) {
    check(this.userId, String);

    await HintRequestNotifications.removeAsync({
      _id: hintRequestNotificationId,
      user: this.userId,
    });
  },
});
