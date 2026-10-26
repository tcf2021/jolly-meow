import { z } from "zod";
import { foreignKey } from "../models/customTypes";
import TypedJob from "./TypedJob";

export default new TypedJob("puzzle.createWorkspace", {
  args: z.object({ puzzleId: foreignKey }),
  maxAttempts: 5,
});
