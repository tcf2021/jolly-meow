import { z } from "zod";
import { answer, foreignKey, nonEmptyString } from "./customTypes";
import DriveSync from "./DriveSync";
import {
  attachCustomJsonSchema,
  schemaToJsonSchema,
} from "./generateJsonSchema";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

const tagList = foreignKey.array().default([]);
attachCustomJsonSchema(tagList, {
  bsonType: "array",
  items: schemaToJsonSchema(foreignKey),
  uniqueItems: true,
});

const Puzzle = withCommon(
  z.object({
    hunt: foreignKey,
    tags: tagList,
    title: nonEmptyString,
    url: z.string().url().optional(),
    answers: answer.array(),
    expectedAnswerCount: z.number().int().nonnegative(),
    docType: z
      .enum(["spreadsheet", "document", "excalidraw", "none"])
      .optional(),
    documentUrl: z.string().url().optional(),
    hasWhiteboard: z.boolean().optional(),
    whiteboardGeneration: nonEmptyString.optional(),
    completedWithNoAnswer: z.boolean().optional(),
    replacedBy: foreignKey.optional(),
    driveSync: DriveSync.optional(),
    workspaceError: z.boolean().optional(),
    purging: z.boolean().optional(),
    purgeError: nonEmptyString.optional(),
  }),
);

const Puzzles = new SoftDeletedModel("jr_puzzles", Puzzle);
Puzzles.addIndex({ deleted: 1, hunt: 1 });
Puzzles.addIndex({ url: 1 });
Puzzles.addIndex({ "driveSync.retryAt": 1 }, { sparse: true });
Puzzles.addIndex({ hunt: 1 });
export type PuzzleType = ModelType<typeof Puzzles>;

export default Puzzles;
