import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    messageId: string;
    puzzleId: string;
    huntId: string;
  },
  void
>("ChatMessages.methods.delete");
