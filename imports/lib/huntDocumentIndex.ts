import type { DocumentType } from "./models/Documents";
import type { PuzzleType } from "./models/Puzzles";
import { puzzleHasWhiteboard } from "./PuzzleDocumentTypes";
import { computeSolvedness } from "./solvedness";

const statusLabels = {
  solved: "已解出",
  unsolved: "未解出",
  noAnswers: "无需答案",
};

// Quote every field and prevent a puzzle title from becoming a Sheets formula.
export function indexCsvCell(value: string) {
  const safe = /^\s*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildHuntDocumentIndex(
  puzzles: PuzzleType[],
  documents: DocumentType[],
  origin: string,
) {
  const rows = [
    [
      "题目",
      "状态",
      "文档类型",
      "协作文档",
      "协作白板",
      "题目页面",
      "原题网址",
    ],
  ];
  const ordered = puzzles
    .filter((puzzle) => !puzzle.deleted)
    .toSorted(
      (a, b) =>
        a.title.localeCompare(b.title, "zh-CN") || a._id.localeCompare(b._id),
    );
  for (const puzzle of ordered) {
    const type = puzzle.docType ?? "spreadsheet";
    const doc = documents
      .filter(
        (item) =>
          !item.deleted &&
          item.puzzle === puzzle._id &&
          item.provider === "google" &&
          item.value.type === type,
      )
      .toSorted(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a._id.localeCompare(b._id),
      )[0];
    const google = doc?.provider === "google" ? doc : undefined;
    const googleEnabled = type === "spreadsheet" || type === "document";
    const googleLabel = type === "spreadsheet" ? "Google 表格" : "Google 文档";
    const googleLink = googleEnabled
      ? (puzzle.documentUrl ??
        (google
          ? `https://docs.google.com/${type === "spreadsheet" ? "spreadsheets" : "document"}/d/${encodeURIComponent(google.value.id)}/edit`
          : ""))
      : "";
    const page = `${origin.replace(/\/$/, "")}/hunts/${encodeURIComponent(puzzle.hunt)}/puzzles/${encodeURIComponent(puzzle._id)}`;
    rows.push([
      puzzle.title,
      statusLabels[computeSolvedness(puzzle)],
      googleEnabled ? googleLabel : "",
      googleLink,
      puzzleHasWhiteboard(puzzle) ? page : "",
      page,
      puzzle.url ?? "",
    ]);
  }
  return rows.map((row) => row.map(indexCsvCell).join(",")).join("\r\n");
}
