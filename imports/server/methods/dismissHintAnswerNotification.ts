import { check } from "meteor/check";
import HintAnswerNotifications from "../../lib/models/HintAnswerNotifications";
import dismissHintAnswerNotification from "../../methods/dismissHintAnswerNotification";
import defineMethod from "./defineMethod";

defineMethod(dismissHintAnswerNotification, {
  validate(arg) {
    check(arg, { hintAnswerNotificationId: String });
    return arg;
  },

  async run({ hintAnswerNotificationId }) {
    check(this.userId, String);

    await HintAnswerNotifications.removeAsync({
      _id: hintAnswerNotificationId,
      user: this.userId,
    });
  },
});
