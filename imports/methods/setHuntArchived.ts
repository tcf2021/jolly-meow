import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ huntId: string; archived: boolean }, void>(
  "Hunts.methods.setArchived",
);
