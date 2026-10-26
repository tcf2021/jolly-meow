import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import Flags from "../../../../imports/Flags";
import Documents from "../../../../imports/lib/models/Documents";
import HuntFolders from "../../../../imports/lib/models/HuntFolders";
import Puzzles from "../../../../imports/lib/models/Puzzles";
import GoogleClient from "../../../../imports/server/googleClientRefresher";
import { trashDisabledGoogleDocument } from "../../../../imports/server/puzzleWorkspaceCleanup";

describe("recycling disabled Google workspaces", () => {
  const setup = () => {
    const get = sinon.stub().resolves({
      data: {
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: false,
        capabilities: { canTrash: true },
      },
    });
    const update = sinon.stub().resolves({ data: { trashed: true } });
    sinon.stub(GoogleClient, "drive").value({ files: { get, update } });
    sinon.stub(GoogleClient, "ready").returns(true);
    sinon.stub(Flags, "activeAsync").resolves(false);
    const index = sinon.stub(HuntFolders, "findOneAsync").resolves(undefined);
    const references = sinon
      .stub(Documents, "find")
      .returns({ fetchAsync: sinon.stub().resolves([]) } as any);
    const linked = sinon
      .stub(Puzzles, "find")
      .returns({ fetchAsync: sinon.stub().resolves([]) } as any);
    return { get, update, references, linked, index };
  };
  afterEach(() => sinon.restore());
  const rejectsWith = async (code: number) => {
    try {
      await trashDisabledGoogleDocument("puzzle", "file", "spreadsheet");
      assert.fail("Recycling should have failed");
    } catch (error) {
      assert.instanceOf(error, Meteor.Error);
      assert.equal(error.error, code);
    }
  };
  it("moves a manually linked file to trash without permanently deleting it", async () => {
    const { get, update } = setup();
    await trashDisabledGoogleDocument("puzzle", "file", "spreadsheet");
    assert.equal(get.firstCall.args[0].fileId, "file");
    assert.deepEqual(update.firstCall.args[0], {
      fileId: "file",
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    assert.isFalse(update.firstCall.args[1].retry);
  });
  it("protects a hunt index even if someone linked it as a puzzle workspace", async () => {
    const { index, get, update } = setup();
    index.resolves({ indexSpreadsheet: "file" } as any);
    await rejectsWith(409);
    assert.isFalse(get.called);
    assert.isFalse(update.called);
  });
  it("rejects missing trash permission before sending a mutation", async () => {
    const { get, update } = setup();
    get.resolves({
      data: {
        mimeType: "application/vnd.google-apps.spreadsheet",
        capabilities: { canTrash: false },
      },
    });
    await rejectsWith(403);
    assert.isFalse(update.called);
  });
  it("does not recycle folders or unexpected file types", async () => {
    const { get, update } = setup();
    get.resolves({
      data: {
        mimeType: "application/vnd.google-apps.folder",
        capabilities: { canTrash: true },
      },
    });
    await rejectsWith(400);
    assert.isFalse(update.called);
  });
  it("protects a file also referenced by another active puzzle", async () => {
    const { references, get, update } = setup();
    references.returns({
      fetchAsync: sinon.stub().resolves([{ puzzle: "other" }]),
    } as any);
    sinon.stub(Puzzles, "findOneAsync").resolves({ _id: "other" } as any);
    await rejectsWith(409);
    assert.isFalse(get.called);
    assert.isFalse(update.called);
  });
  it("protects another puzzle's link even before its document association is created", async () => {
    const { linked, update } = setup();
    linked.returns({
      fetchAsync: sinon.stub().resolves([
        {
          docType: "spreadsheet",
          documentUrl: "https://docs.google.com/spreadsheets/d/file/edit",
        },
      ]),
    } as any);
    await rejectsWith(409);
    assert.isFalse(update.called);
  });
  it("accepts files already in trash without another write", async () => {
    const { get, update } = setup();
    get.resolves({
      data: {
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: true,
      },
    });
    await trashDisabledGoogleDocument("puzzle", "file", "spreadsheet");
    assert.isFalse(update.called);
  });
  it("reports API failures without exposing request credentials", async () => {
    const { update } = setup();
    update.rejects(new Error("Sensitive request headers"));
    await rejectsWith(502);
  });
  it("requires a configured Google integration", async () => {
    const { get, update } = setup();
    (GoogleClient.ready as sinon.SinonStub).returns(false);
    await rejectsWith(503);
    assert.isFalse(get.called);
    assert.isFalse(update.called);
  });
});
