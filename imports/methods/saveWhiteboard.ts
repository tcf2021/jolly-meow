import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  { puzzleId: string; scene: string; generation?: string },
  void
>("Whiteboards.methods.save");
