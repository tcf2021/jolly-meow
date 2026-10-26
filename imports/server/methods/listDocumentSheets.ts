import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { GaxiosError } from "gaxios";
import isAdmin from "../../lib/isAdmin";
import Documents from "../../lib/models/Documents";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Settings from "../../lib/models/Settings";
import listDocumentSheets from "../../methods/listDocumentSheets";
import CachedSheetLists from "../CachedSheetLists";
import callGoogleImageScript from "../callGoogleImageScript";
import GoogleClient from "../googleClientRefresher";
import defineMethod from "./defineMethod";

const sheetLists = new CachedSheetLists();

defineMethod(listDocumentSheets, {
  validate(arg) {
    check(arg, {
      documentId: String,
      refresh: Match.Optional(Boolean),
    });
    return arg;
  },

  async run({ documentId, refresh }) {
    check(this.userId, String);

    const document = await Documents.findOneAsync(documentId);
    if (!document) {
      throw new Meteor.Error(404, "Document not found");
    }
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(document.hunt) && !isAdmin(user)) {
      throw new Meteor.Error(403, "User is not a member of this hunt");
    }

    if (
      document.provider !== "google" ||
      document.value.type !== "spreadsheet"
    ) {
      throw new Meteor.Error(400, "Document is not a Google spreadsheet");
    }

    const app = await Settings.findOneAsync({ name: "google.script" });
    if (!app?.value.sharedSecret || !app?.value.endpointUrl) {
      throw new Meteor.Error(400, "Google Script is not configured");
    }

    const scriptApp = {
      endpointUrl: app.value.endpointUrl,
      sharedSecret: app.value.sharedSecret,
    };
    const client = GoogleClient.ready() ? GoogleClient.sheets : undefined;
    this.unblock();
    return sheetLists.load(
      document.value.id,
      client ?? scriptApp.endpointUrl,
      async () => {
        if (client) {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            const response = await Promise.race([
              client.spreadsheets.get(
                {
                  spreadsheetId: document.value.id,
                  fields: "sheets.properties(sheetId,title)",
                },
                {
                  timeout: 12_000,
                  signal: AbortSignal.timeout(12_000),
                  retry: false,
                },
              ),
              new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => {
                  reject(
                    new Meteor.Error(
                      "google-script-timeout",
                      "Google took too long to return the sheet list.",
                    ),
                  );
                }, 12_000);
              }),
            ]);
            return (response.data.sheets ?? []).map(({ properties }) => {
              if (
                typeof properties?.sheetId !== "number" ||
                typeof properties.title !== "string"
              )
                throw new Meteor.Error(
                  "google-script-response",
                  "Google returned an invalid sheet list.",
                );
              return { id: properties.sheetId, name: properties.title };
            });
          } catch (error) {
            if (error instanceof Meteor.Error) throw error;
            const status =
              error instanceof GaxiosError ? error.response?.status : undefined;
            // A manually linked sheet can belong to the Apps Script account
            // instead of the Drive management account. Preserve that access.
            if (status !== 403 && status !== 404)
              throw new Meteor.Error(
                "google-sheets-unavailable",
                "Could not fetch the sheet list from Google. Please retry shortly.",
              );
          } finally {
            if (timeout !== undefined) clearTimeout(timeout);
          }
        }
        const json = await callGoogleImageScript(scriptApp, "listSheets", {
          spreadsheet: document.value.id,
        });
        if (
          !Array.isArray(json.sheets) ||
          !json.sheets.every(
            (sheet: { id?: unknown; name?: unknown } | null) =>
              sheet &&
              typeof sheet.id === "number" &&
              typeof sheet.name === "string",
          )
        )
          throw new Meteor.Error(
            "google-script-response",
            "Google returned an invalid sheet list.",
          );
        return json.sheets;
      },
      refresh,
    );
  },
});
