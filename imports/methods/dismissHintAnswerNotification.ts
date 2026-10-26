import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ hintAnswerNotificationId: string }, void>(
  "HintAnswerNotifications.methods.dismiss",
);
