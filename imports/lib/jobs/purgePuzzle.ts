import { z } from "zod";
import { foreignKey } from "../models/customTypes";
import TypedJob from "./TypedJob";

export default new TypedJob("puzzle.purge", {
  args: z.object({ puzzleId: foreignKey, huntId: foreignKey }),
  maxAttempts: 5,
});
