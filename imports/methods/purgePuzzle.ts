import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  { puzzleId: string; confirmationTitle: string },
  void
>("Puzzles.methods.purge");
