import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ avatar: string | null }, void>(
  "Users.methods.setAvatar",
);
