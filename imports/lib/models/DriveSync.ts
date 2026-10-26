import { z } from "zod";
import { nonEmptyString } from "./customTypes";

const DriveSync = z.object({
  revision: nonEmptyString,
  retryAt: z.date(),
  attempts: z.number().int().nonnegative(),
  error: nonEmptyString.optional(),
});

export type DriveSyncType = z.infer<typeof DriveSync>;
export default DriveSync;
