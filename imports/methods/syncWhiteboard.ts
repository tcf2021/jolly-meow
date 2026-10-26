import type { WhiteboardPresence } from "../lib/whiteboardCollaboration";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    sessionId: string;
    scene?: string;
    presence?: WhiteboardPresence;
    generation?: string;
  },
  void
>("Whiteboards.methods.sync");
