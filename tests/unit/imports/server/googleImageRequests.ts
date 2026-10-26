import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import sinon from "sinon";
import CachedSheetLists from "../../../../imports/server/CachedSheetLists";
import callGoogleImageScript from "../../../../imports/server/callGoogleImageScript";

describe("Google image requests", function () {
  afterEach(function () {
    sinon.restore();
  });

  const app = {
    endpointUrl: "https://script.google.com/test-image-service",
    sharedSecret: "unit-test-secret",
  };
  const sheets = [{ id: 0, name: "Sheet 1" }];

  it("coalesces simultaneous reads and reuses a successful sheet list", async function () {
    const cache = new CachedSheetLists();
    const fetchSheets = sinon.stub().resolves(sheets);
    const results = await Promise.all([
      cache.load("doc", "account", fetchSheets),
      cache.load("doc", "account", fetchSheets),
    ]);
    assert.deepEqual(results, [sheets, sheets]);
    assert.deepEqual(await cache.load("doc", "account", fetchSheets), sheets);
    assert.isTrue(fetchSheets.calledOnce);
  });

  it("expires cached sheets and supports an explicit refresh", async function () {
    const now = sinon.stub(Date, "now").returns(1000);
    const cache = new CachedSheetLists(500);
    const fetchSheets = sinon.stub().resolves(sheets);
    await cache.load("doc", "account", fetchSheets);
    now.returns(1501);
    await cache.load("doc", "account", fetchSheets);
    await cache.load("doc", "account", fetchSheets, true);
    assert.equal(fetchSheets.callCount, 3);
  });

  it("does not reuse sheet lists after the Google account changes", async function () {
    const cache = new CachedSheetLists();
    const fetchSheets = sinon.stub().resolves(sheets);
    await cache.load("doc", {}, fetchSheets);
    await cache.load("doc", {}, fetchSheets);
    assert.isTrue(fetchSheets.calledTwice);
  });

  it("does not cache failed reads", async function () {
    const cache = new CachedSheetLists();
    const fetchSheets = sinon.stub();
    fetchSheets.onFirstCall().rejects(new Error("offline"));
    fetchSheets.onSecondCall().resolves(sheets);
    await assert.isRejected(
      cache.load("doc", "account", fetchSheets),
      /offline/,
    );
    assert.deepEqual(await cache.load("doc", "account", fetchSheets), sheets);
    assert.isTrue(fetchSheets.calledTwice);
  });

  it("keeps the selected sheet ID including zero and uses a bounded request", async function () {
    const request = sinon
      .stub(globalThis, "fetch")
      .resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await callGoogleImageScript(app, "insertImage", {
      spreadsheet: "doc",
      sheet: "0",
      source: "upload",
    });
    assert.isTrue(request.calledOnce);
    const options = request.firstCall.args[1]!;
    assert.equal(JSON.parse(options.body as string).parameters.sheet, "0");
    assert.instanceOf(options.signal, AbortSignal);
  });

  it("never retries an image insertion with an uncertain outcome", async function () {
    const request = sinon
      .stub(globalThis, "fetch")
      .rejects(new Error("socket hang up"));
    try {
      await callGoogleImageScript(app, "insertImage", { spreadsheet: "doc" });
      assert.fail("Expected an insertion error");
    } catch (error) {
      assert.instanceOf(error, Meteor.Error);
      assert.equal(error.error, "google-script-unavailable");
      assert.include(error.message, "avoid duplicate images");
    }
    assert.isTrue(request.calledOnce);
  });

  it("reports timeouts as a recoverable error", async function () {
    sinon
      .stub(globalThis, "fetch")
      .rejects(new DOMException("timed out", "TimeoutError"));
    try {
      await callGoogleImageScript(app, "listSheets", { spreadsheet: "doc" });
      assert.fail("Expected a timeout");
    } catch (error) {
      assert.equal((error as Meteor.Error).error, "google-script-timeout");
    }
  });

  it("handles Google login HTML without exposing its response or secrets", async function () {
    sinon
      .stub(globalThis, "fetch")
      .resolves(new Response("<html>private token</html>"));
    try {
      await callGoogleImageScript(app, "listSheets", { spreadsheet: "doc" });
      assert.fail("Expected a deployment error");
    } catch (error) {
      assert.equal((error as Meteor.Error).error, "google-script-response");
      assert.notInclude((error as Error).message, "private token");
    }
  });

  it("distinguishes a deleted sheet from an authorization failure", async function () {
    sinon
      .stub(globalThis, "fetch")
      .resolves(
        new Response(JSON.stringify({ ok: false, error: "Invalid sheet ID" })),
      );
    try {
      await callGoogleImageScript(app, "insertImage", { spreadsheet: "doc" });
      assert.fail("Expected a missing-sheet error");
    } catch (error) {
      assert.equal(
        (error as Meteor.Error).error,
        "google-script-sheet-missing",
      );
    }
  });
});
