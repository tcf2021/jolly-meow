import { assert } from "chai";
import driveMemberEmail from "../../../../imports/lib/driveMemberEmail";
import {
  buildHuntDocumentIndex,
  indexCsvCell,
} from "../../../../imports/lib/huntDocumentIndex";
import type { DocumentType } from "../../../../imports/lib/models/Documents";
import type { PuzzleType } from "../../../../imports/lib/models/Puzzles";

const puzzle = (id: string, extra: Partial<PuzzleType> = {}): PuzzleType => ({
  _id: id,
  hunt: "hunt-1",
  title: id,
  tags: [],
  answers: [],
  expectedAnswerCount: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdBy: "user",
  updatedBy: "user",
  deleted: false,
  ...extra,
});
const document = (id: string, puzzleId: string): DocumentType => ({
  _id: id,
  hunt: "hunt-1",
  puzzle: puzzleId,
  provider: "google",
  value: { type: "spreadsheet", id },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdBy: "user",
  updatedBy: "user",
  deleted: false,
});

describe("hunt document index", function () {
  it("includes manual Docs, automatic Sheets and whiteboard-only puzzles without answers", function () {
    const csv = buildHuntDocumentIndex(
      [
        puzzle("doc", {
          docType: "document",
          documentUrl: "https://docs.google.com/document/d/manual/edit",
          answers: ["SECRET"],
          hasWhiteboard: true,
        }),
        puzzle("sheet", { docType: "spreadsheet" }),
        puzzle("board", {
          docType: "none",
          hasWhiteboard: true,
          expectedAnswerCount: 0,
        }),
      ],
      [document("auto-sheet", "sheet")],
      "https://hunt.example/",
    );
    assert.include(csv, "https://docs.google.com/document/d/manual/edit");
    assert.include(
      csv,
      "https://docs.google.com/spreadsheets/d/auto-sheet/edit",
    );
    assert.include(csv, "https://hunt.example/hunts/hunt-1/puzzles/board");
    assert.include(csv, "已解出");
    assert.include(csv, "未解出");
    assert.include(csv, "无需答案");
    assert.notInclude(csv, "SECRET");
  });
  it("removes deleted puzzles and stale document types", function () {
    const csv = buildHuntDocumentIndex(
      [
        puzzle("gone", { deleted: true }),
        puzzle("doc", { docType: "document" }),
      ],
      [document("old-sheet", "doc")],
      "https://hunt.example",
    );
    assert.notInclude(csv, "gone");
    assert.notInclude(csv, "old-sheet");
  });
  it("escapes CSV punctuation and blocks formula-like titles", function () {
    assert.equal(indexCsvCell('题, "名"\n第二行'), '"题, ""名""\n第二行"');
    for (const value of ["=IMPORTXML(1)", " +SUM(1)", "-1", "@name"])
      assert.equal(indexCsvCell(value), `"'${value}"`);
  });
  it("is stable regardless of database query order", function () {
    const a = puzzle("a");
    const b = puzzle("b");
    assert.equal(
      buildHuntDocumentIndex([a, b], [], "https://hunt.example"),
      buildHuntDocumentIndex([b, a], [], "https://hunt.example"),
    );
  });
});

describe("Drive member identity", function () {
  it("uses a bound Google account before the registered email", function () {
    assert.equal(
      driveMemberEmail({
        googleAccount: "Bound@Example.com",
        emails: [{ address: "login@example.com", verified: true }],
      }),
      "bound@example.com",
    );
  });
  it("requires a bound Google account even when the registration email is verified", function () {
    assert.isUndefined(
      driveMemberEmail({
        emails: [
          { address: "pending@example.com", verified: false },
          { address: "Verified@Example.com", verified: true },
        ],
      }),
    );
    assert.isUndefined(
      driveMemberEmail({
        emails: [{ address: "pending@example.com", verified: false }],
      }),
    );
  });
});
