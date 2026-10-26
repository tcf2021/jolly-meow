import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import Logger from "../Logger";
import Documents from "../lib/models/Documents";
import type { PuzzleType } from "../lib/models/Puzzles";
import Puzzles from "../lib/models/Puzzles";
import { googleDocumentId } from "../lib/PuzzleDocumentTypes";
import { ensureDocument } from "./gdrive";
import GoogleClient from "./googleClientRefresher";
import withLock from "./withLock";

export default async function ensurePuzzleWorkspace(
  puzzle: Pick<
    PuzzleType,
    "_id" | "hunt" | "title" | "docType" | "documentUrl"
  >,
) {
  if (puzzle.docType === "none") return undefined;
  const existing = await Documents.findOneAsync({ puzzle: puzzle._id });
  if (existing) return existing;
  if (puzzle.docType === "excalidraw" || puzzle.documentUrl) {
    return withLock(`puzzle:${puzzle._id}:documents`, async () => {
      const currentPuzzle = await Puzzles.findOneAsync(puzzle._id);
      if (
        !currentPuzzle ||
        currentPuzzle.docType === "none" ||
        currentPuzzle.documentUrl !== puzzle.documentUrl ||
        currentPuzzle.docType !== puzzle.docType
      )
        return undefined;
      const saved = await Documents.findOneAsync({ puzzle: puzzle._id });
      if (saved) return saved;
      const type = puzzle.docType ?? "spreadsheet";
      const document =
        type === "excalidraw"
          ? {
              provider: "excalidraw" as const,
              value: { type: "excalidraw" as const, id: puzzle._id },
            }
          : {
              provider: "google" as const,
              value: {
                type,
                id: googleDocumentId(type, puzzle.documentUrl!),
                managed: false,
              },
            };
      const id = await Documents.insertAsync({
        hunt: puzzle.hunt,
        puzzle: puzzle._id,
        ...document,
      });
      return Documents.findOneAsync(id);
    });
  }
  if ((await Flags.activeAsync("disable.google")) || !GoogleClient.ready())
    return undefined;
  try {
    return await ensureDocument(puzzle, puzzle.docType ?? "spreadsheet");
  } catch (error) {
    if (error instanceof Meteor.Error) throw error;
    // Do not log the request/config object: it contains OAuth headers.
    const apiError = error as {
      response?: { status?: number; data?: { error?: { message?: string } } };
    };
    Logger.warn("Google workspace creation failed", {
      puzzleId: puzzle._id,
      status: apiError.response?.status,
      message: apiError.response?.data?.error?.message,
    });
    throw new Meteor.Error(500, "创建协作文档失败，请稍后重试");
  }
}
