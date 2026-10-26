export const PuzzleDocumentTypes = [
  "spreadsheet",
  "document",
  "excalidraw",
  "none",
] as const;
export type PuzzleDocumentType = (typeof PuzzleDocumentTypes)[number];

export function optionalWorkspaceUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function puzzleHasWhiteboard(puzzle: {
  docType?: PuzzleDocumentType;
  hasWhiteboard?: boolean;
}) {
  return puzzle.hasWhiteboard ?? puzzle.docType === "excalidraw";
}

// Legacy whiteboard-only puzzles predate the independent whiteboard option.
export const whiteboardPuzzleSelector = {
  $or: [
    { hasWhiteboard: true },
    { hasWhiteboard: { $exists: false }, docType: "excalidraw" as const },
  ],
};

export function googleDocumentId(type: PuzzleDocumentType, url: string) {
  const message =
    type === "spreadsheet"
      ? "请填写有效的 Google 表格链接"
      : "请填写有效的 Google 文档链接";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(message);
  }
  const path = type === "spreadsheet" ? "spreadsheets" : "document";
  const match = parsed.pathname.match(
    new RegExp(`^/${path}/d/([A-Za-z0-9_-]+)(?:/|$)`),
  );
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "docs.google.com" ||
    !match
  ) {
    throw new Error(message);
  }
  return match[1]!;
}
