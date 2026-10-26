import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleUrl: string;
  },
  string
>("Puzzles.method.findByUrl");
