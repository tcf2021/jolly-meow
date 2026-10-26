import { z } from "zod";
import { nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import Model from "./Model";

// _id is the hunt ID. Only public link/status fields are published to members.
export const HuntFolder = z.object({
  folder: nonEmptyString,
  indexSpreadsheet: nonEmptyString.optional(),
  indexContentHash: nonEmptyString.optional(),
  indexUpdatedAt: z.date().optional(),
  indexError: nonEmptyString.optional(),
  memberAccessError: nonEmptyString.optional(),
  memberAccessErrorCode: z
    .enum(["disabled", "unbound", "failed", "mixed"])
    .optional(),
});

const HuntFolders = new Model("jr_hunt_folders", HuntFolder);
export type HuntFolderType = ModelType<typeof HuntFolders>;
export default HuntFolders;
