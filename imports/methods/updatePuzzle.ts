import type { PuzzleDocumentType } from "../lib/PuzzleDocumentTypes";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    puzzleId: string;
    title: string;
    url?: string;
    tags: string[];
    expectedAnswerCount: number;
    docType?: PuzzleDocumentType;
    documentUrl?: string;
    hasWhiteboard?: boolean;
    confirmWorkspaceDeletion?: boolean;
    allowDuplicateUrls?: boolean;
    completedWithNoAnswer?: boolean;
  },
  void
>("Puzzles.methods.update");
