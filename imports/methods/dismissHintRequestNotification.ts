import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ hintRequestNotificationId: string }, void>(
  "HintRequestNotifications.methods.dismiss",
);
