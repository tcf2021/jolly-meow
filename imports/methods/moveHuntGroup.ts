import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    huntId: string;
    tagId: string;
    direction: "up" | "down";
    neighborTagId?: string;
  },
  void
>("Hunts.methods.moveGroup");
