import { Meteor } from "meteor/meteor";
import i18n from "i18next";
import Flags from "../Flags";
import GdriveMimeTypes, {
  type GdriveMimeTypesType,
} from "../lib/GdriveMimeTypes";
import DocumentActivities from "../lib/models/DocumentActivities";
import Documents from "../lib/models/Documents";
import HuntFolders from "../lib/models/HuntFolders";
import Puzzles from "../lib/models/Puzzles";
import Whiteboards from "../lib/models/Whiteboards";
import {
  googleDocumentId,
  puzzleHasWhiteboard,
} from "../lib/PuzzleDocumentTypes";
import GoogleClient from "./googleClientRefresher";
import { serverLanguage } from "./lang";
import { discardPuzzleWhiteboardRoom } from "./whiteboardRooms";
import withLock from "./withLock";

export const workspaceCleanupError = (code: number, key: string) =>
  new Meteor.Error(
    code,
    i18n.t(`workspaceCleanup.${key}`, { lng: serverLanguage }),
  );

export async function clearDisabledPuzzleWhiteboard(puzzleId: string) {
  await discardPuzzleWhiteboardRoom(puzzleId);
  await withLock(`whiteboard:${puzzleId}`, async () => {
    const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
    if (puzzle && puzzleHasWhiteboard(puzzle))
      throw workspaceCleanupError(409, "whiteboardStillEnabled");
    await Whiteboards.removeAsync(puzzleId);
  });
}

export async function trashDisabledGoogleDocument(
  puzzleId: string,
  fileId: string,
  type: GdriveMimeTypesType,
) {
  if (await HuntFolders.findOneAsync({ indexSpreadsheet: fileId }))
    throw workspaceCleanupError(409, "googleIndex");
  // Trashing a shared file would also disable another puzzle's workspace.
  const references = await Documents.find({
    puzzle: { $ne: puzzleId },
    provider: "google",
    "value.id": fileId,
  }).fetchAsync();
  for (const reference of references)
    if (await Puzzles.findOneAsync(reference.puzzle))
      throw workspaceCleanupError(409, "googleShared");
  const linkedPuzzles = await Puzzles.find({
    _id: { $ne: puzzleId },
    docType: { $ne: "none" },
    documentUrl: { $exists: true },
  }).fetchAsync();
  for (const puzzle of linkedPuzzles) {
    try {
      if (
        googleDocumentId(
          puzzle.docType ?? "spreadsheet",
          puzzle.documentUrl,
        ) === fileId
      )
        throw workspaceCleanupError(409, "googleShared");
    } catch (error) {
      if (error instanceof Meteor.Error) throw error;
    }
  }
  if (
    !GoogleClient.ready() ||
    !GoogleClient.drive ||
    (await Flags.activeAsync("disable.google"))
  )
    throw workspaceCleanupError(503, "googleUnavailable");
  try {
    const file = await GoogleClient.drive.files.get(
      {
        fileId,
        fields: "mimeType,trashed,capabilities(canTrash)",
        supportsAllDrives: true,
      },
      { timeout: 15000, retry: false },
    );
    if (file.data.mimeType !== GdriveMimeTypes[type])
      throw workspaceCleanupError(400, "googleWrongType");
    if (file.data.trashed) return;
    if (!file.data.capabilities?.canTrash)
      throw workspaceCleanupError(403, "googlePermission");
    await GoogleClient.drive.files.update(
      { fileId, requestBody: { trashed: true }, supportsAllDrives: true },
      { timeout: 15000, retry: false },
    );
  } catch (error) {
    if (error instanceof Meteor.Error) throw error;
    // Google request errors can contain OAuth headers; expose only a safe message.
    throw workspaceCleanupError(502, "googleFailed");
  }
}

export async function removeDisabledDocumentAssociation(documentId: string) {
  await DocumentActivities.removeAsync({ document: documentId });
  await Documents.removeAsync(documentId);
}
