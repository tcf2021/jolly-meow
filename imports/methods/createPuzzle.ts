import type { PuzzleDocumentType } from "../lib/PuzzleDocumentTypes";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    huntId: string;
    title: string;
    url?: string;
    tags: string[];
    expectedAnswerCount: number;
    docType: PuzzleDocumentType;
    documentUrl?: string;
    hasWhiteboard?: boolean;
    allowDuplicateUrls?: boolean;
    completedWithNoAnswer?: boolean;
  },
  string
>("Puzzles.methods.create");
