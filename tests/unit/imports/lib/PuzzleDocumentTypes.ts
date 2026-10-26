import { assert } from "chai";
import {
  googleDocumentId,
  optionalWorkspaceUrl,
  puzzleHasWhiteboard,
} from "../../../../imports/lib/PuzzleDocumentTypes";

describe("independent puzzle workspaces", function () {
  it("keeps legacy whiteboard-only and Google-only puzzles compatible", function () {
    assert.isTrue(puzzleHasWhiteboard({ docType: "excalidraw" }));
    assert.isFalse(puzzleHasWhiteboard({ docType: "spreadsheet" }));
    assert.isFalse(puzzleHasWhiteboard({}));
  });
  it("supports a whiteboard alongside either Google document type", function () {
    for (const docType of ["spreadsheet", "document", "none"] as const)
      assert.isTrue(puzzleHasWhiteboard({ docType, hasWhiteboard: true }));
  });
  it("respects an explicit disabled whiteboard even on a legacy puzzle", function () {
    assert.isFalse(
      puzzleHasWhiteboard({ docType: "excalidraw", hasWhiteboard: false }),
    );
  });
});

describe("Google workspace links", function () {
  it("treats blank links as automatic document creation", function () {
    for (const value of [undefined, "", " \t\n "]) {
      assert.isUndefined(optionalWorkspaceUrl(value));
    }
    const url = "https://docs.google.com/document/d/document-id/edit";
    assert.equal(optionalWorkspaceUrl(`  ${url}  `), url);
  });
  it("accepts a Sheet link with sharing parameters", function () {
    assert.equal(
      googleDocumentId(
        "spreadsheet",
        "https://docs.google.com/spreadsheets/d/sheet_123-456/edit?usp=sharing#gid=0",
      ),
      "sheet_123-456",
    );
  });
  it("accepts a Google Doc link", function () {
    assert.equal(
      googleDocumentId(
        "document",
        "https://docs.google.com/document/d/document-id/edit",
      ),
      "document-id",
    );
  });
  it("rejects a Google link of the wrong document type", function () {
    assert.throws(
      () =>
        googleDocumentId(
          "document",
          "https://docs.google.com/spreadsheets/d/sheet-id/edit",
        ),
      "Google 文档",
    );
  });
  it("rejects other hosts and insecure links", function () {
    for (const url of [
      "https://docs.google.com.example.com/document/d/doc-id/edit",
      "http://docs.google.com/document/d/doc-id/edit",
      "https://example.com/document/d/doc-id/edit",
    ])
      assert.throws(() => googleDocumentId("document", url), "Google 文档");
  });
  it("uses a readable validation error for malformed input", function () {
    assert.throws(
      () => googleDocumentId("spreadsheet", "not a URL"),
      "Google 表格",
    );
  });
});
