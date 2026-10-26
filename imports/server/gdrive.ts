import { Meteor } from "meteor/meteor";
import type { drive_v3 as drive } from "@googleapis/drive";
import Flags from "../Flags";
import Logger from "../Logger";
import type { GdriveMimeTypesType } from "../lib/GdriveMimeTypes";
import GdriveMimeTypes from "../lib/GdriveMimeTypes";
import Documents from "../lib/models/Documents";
import FolderPermissions from "../lib/models/FolderPermissions";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import type { SettingType } from "../lib/models/Settings";
import Settings from "../lib/models/Settings";
import getTeamName from "./getTeamName";
import GoogleClient from "./googleClientRefresher";
import HuntFolders from "./models/HuntFolders";
import withLock from "./withLock";
import withRenewedLock from "./withRenewedLock";

async function checkClientOk() {
  if (!GoogleClient.ready()) {
    throw new Meteor.Error(500, "Google Drive client is not configured.");
  }

  if (await Flags.activeAsync("disable.google")) {
    throw new Meteor.Error(500, "Google integration is disabled.");
  }
}

async function fetchAllPermissions(fileId: string) {
  await checkClientOk();
  const client = GoogleClient.drive;
  if (!client) {
    throw new Meteor.Error(500, "Google integration is disabled");
  }

  const permissions = [] as NonNullable<
    drive.Schema$PermissionList["permissions"]
  >;
  let token: string | undefined;
  for (;;) {
    const response = await client.permissions.list({
      fileId,
      pageToken: token,
      fields: "nextPageToken,permissions(id,type,role,emailAddress)",
    });
    const page = response.data;
    if (page.permissions) {
      permissions.push(...page.permissions);
    }
    token = page.nextPageToken ?? undefined;
    if (!token) {
      break;
    }
  }

  return permissions;
}

export async function documentHasAnyoneReaderPermission(fileId: string) {
  const permissions = await fetchAllPermissions(fileId);
  return permissions.some(
    (permission) =>
      permission.type === "anyone" && permission.role === "reader",
  );
}

export async function grantAnyoneReaderPermission(fileId: string) {
  await checkClientOk();
  const client = GoogleClient.drive;
  if (!client) throw new Meteor.Error(500, "Google integration is disabled");

  await client.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    sendNotificationEmail: false,
  });
}

export async function revokeAnyoneReaderPermission(fileId: string) {
  const permissions = await fetchAllPermissions(fileId);
  await checkClientOk();
  const client = GoogleClient.drive;
  if (!client) throw new Meteor.Error(500, "Google integration is disabled");

  for (const permission of permissions) {
    if (permission.id && permission.type === "anyone") {
      try {
        await client.permissions.delete({
          fileId,
          permissionId: permission.id,
        });
      } catch (error) {
        Logger.warn("Failed to revoke anyone permission", {
          fileId,
          permissionId: permission.id,
          error,
        });
      }
    }
  }
}

async function createFolder(name: string, parentId?: string) {
  await checkClientOk();
  if (!GoogleClient.drive)
    throw new Meteor.Error(500, "Google integration is disabled");

  const mimeType = "application/vnd.google-apps.folder";
  const parents = parentId ? [parentId] : undefined;

  const folder = await GoogleClient.drive.files.create({
    requestBody: {
      name,
      mimeType,
      parents,
    },
  });

  return folder.data.id!;
}

async function createDocument(
  huntId: string,
  name: string,
  type: GdriveMimeTypesType,
  parentId?: string,
) {
  if (!Object.hasOwn(GdriveMimeTypes, type)) {
    throw new Meteor.Error(400, `Invalid document type ${type}`);
  }
  await checkClientOk();
  if (!GoogleClient.drive || !GoogleClient.sheets)
    throw new Meteor.Error(500, "Google integration is disabled");

  const template = (await Settings.findOneAsync({
    name: `gdrive.template.${type}` as any,
  })) as
    | undefined
    | (SettingType &
        (
          | { name: "gdrive.template.document" }
          | { name: "gdrive.template.spreadsheet" }
        ));
  const mimeType = GdriveMimeTypes[type];
  const parents = parentId ? [parentId] : undefined;

  const file = await (template
    ? GoogleClient.drive.files.copy({
        fileId: template.value.id,
        requestBody: { name, mimeType, parents },
      })
    : GoogleClient.drive.files.create({
        requestBody: { name, mimeType, parents },
      }));

  const fileId = file.data.id!;

  const hunt = await Hunts.findOneAllowingDeletedAsync(huntId);
  if (hunt?.googleGroup) {
    await GoogleClient.drive.permissions.create({
      fileId,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: hunt.googleGroup,
      },
      sendNotificationEmail: false,
    });
  }
  if (type === "spreadsheet") {
    try {
      await GoogleClient.sheets.spreadsheets.batchUpdate({
        spreadsheetId: fileId,
        requestBody: {
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: { importFunctionsExternalUrlAccessAllowed: true },
                fields: "importFunctionsExternalUrlAccessAllowed",
              },
            },
          ],
        },
      });
    } catch (error) {
      const apiError = error as {
        response?: {
          status?: number;
          data?: {
            error?: { message?: string; details?: { reason?: string }[] };
          };
        };
      };
      const detail = apiError.response?.data?.error;
      const serviceDisabled =
        detail?.details?.some((item) => item.reason === "SERVICE_DISABLED") ===
          true ||
        detail?.message?.includes("API has not been used in project") === true;
      if (apiError.response?.status !== 403 || !serviceDisabled) throw error;
      // Drive has already created a usable Sheet. This optional setting must
      // not turn a disabled Sheets API into a failed puzzle and orphaned file.
      Logger.warn(
        "Skipped optional spreadsheet settings: enable Google Sheets API",
        {
          fileId,
          huntId,
        },
      );
    }
  }
  // Team members inherit editor access from the activity folder.
  return fileId;
}

export async function moveDocument(id: string, newParentId: string) {
  await checkClientOk();
  if (!GoogleClient.drive)
    throw new Meteor.Error(500, "Google integration is disabled");

  const parents =
    (
      await GoogleClient.drive.files.get({
        fileId: id,
        fields: "parents",
      })
    ).data.parents ?? [];

  await GoogleClient.drive.files.update({
    fileId: id,
    addParents: newParentId,
    removeParents: parents.join(","),
  });
}

export async function deleteDocument(id: string) {
  await checkClientOk();
  if (!GoogleClient.drive) {
    throw new Meteor.Error(500, "Google integration is disabled");
  }

  await GoogleClient.drive.files.delete({
    fileId: id,
  });
}

export async function huntFolderName(huntName: string) {
  return `${huntName}: ${await getTeamName()}`;
}

export async function puzzleDocumentName(puzzleTitle: string) {
  return `${puzzleTitle}: ${await getTeamName()}`;
}

export async function renameDocument(id: string, name: string) {
  await checkClientOk();
  if (!GoogleClient.drive) return;
  // It's unclear if this can ever return an error
  await GoogleClient.drive.files.update({
    fileId: id,
    requestBody: { name },
  });
}

export async function grantPermission(
  id: string,
  email: string,
  permission: string,
) {
  await checkClientOk();
  if (!GoogleClient.drive) return;
  await GoogleClient.drive.permissions.create({
    fileId: id,
    sendNotificationEmail: false,
    requestBody: {
      type: "user",
      emailAddress: email,
      role: permission,
    },
  });
}

export async function copySheets(fromDocumentId: string, toDocumentId: string) {
  if (!GoogleClient.sheets) {
    throw new Meteor.Error(500, `Google integration is disabled`);
  }

  const fromDocument = await Documents.findOneAsync(fromDocumentId);
  const toDocument = await Documents.findOneAsync(toDocumentId);
  if (!fromDocument) {
    throw new Meteor.Error(404, `Cannot find document ${fromDocumentId}`);
  }
  if (!toDocument) {
    throw new Meteor.Error(404, `Cannot find document ${toDocumentId}`);
  }
  if (
    fromDocument.value.type !== "spreadsheet" ||
    toDocument.value.type !== "spreadsheet"
  ) {
    throw new Meteor.Error(
      400,
      `Cannot copy sheets between non-spreadsheet docs`,
    );
  }

  const sheetInfo = await GoogleClient.sheets.spreadsheets.get({
    spreadsheetId: fromDocument.value.id,
  });
  const sheetsToCopy = sheetInfo.data.sheets;
  if (!sheetsToCopy) {
    throw new Meteor.Error(
      400,
      `Could not get sheet information from sheet ${fromDocument.value.id}`,
    );
  }

  for (const sheet of sheetsToCopy) {
    if (sheet.properties?.sheetId != null) {
      await GoogleClient.sheets.spreadsheets.sheets.copyTo({
        sheetId: sheet.properties?.sheetId,
        spreadsheetId: fromDocument.value.id,
        requestBody: {
          destinationSpreadsheetId: toDocument.value.id,
        },
      });
    }
  }
}

export async function makeReadOnly(fileId: string) {
  await checkClientOk();
  const client = GoogleClient.drive;
  if (!client) return;

  // Fetch all permissions so we can delete them
  const permissions = [] as NonNullable<
    drive.Schema$PermissionList["permissions"]
  >;
  let token: string | undefined;
  for (;;) {
    const response = await client.permissions.list({
      fileId,
      pageToken: token,
    });
    const page = response.data;
    if (page.permissions) {
      permissions.push(...page.permissions);
    }
    const nextToken = response.data.nextPageToken;
    if (!nextToken) break;
    token = nextToken;
  }

  // Leave everyone with read-only access
  await client.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  // Delete any editor permissions. Normally, this will just be the writer
  // permission for "anyone", but in the distant past we would grant individual
  // users write access to files; we want to make sure those get deleted, too.
  for (const permission of permissions) {
    if (permission.id && permission.role === "writer") {
      await client.permissions.delete({
        fileId,
        permissionId: permission.id,
      });
    }
  }
}

export async function makeReadWrite(huntId: string, fileId: string) {
  await checkClientOk();
  if (!GoogleClient.drive) return;

  const hunt = await Hunts.findOneAllowingDeletedAsync(huntId);
  if (hunt?.googleGroup) {
    await GoogleClient.drive.permissions.create({
      fileId,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: hunt.googleGroup,
      },
      sendNotificationEmail: false,
    });
  } else {
    await GoogleClient.drive.permissions.create({
      fileId,
      requestBody: { role: "writer", type: "anyone" },
    });
  }
}

export async function ensureHuntFolder(hunt: { _id: string; name: string }) {
  let folder = await HuntFolders.findOneAsync(hunt._id);
  if (!folder) {
    await checkClientOk();

    folder = await withLock(`hunt:${hunt._id}:folder`, async () => {
      let lockedFolder = await HuntFolders.findOneAsync(hunt._id);
      if (!lockedFolder) {
        Logger.info("Creating missing folder for hunt", {
          huntId: hunt._id,
        });

        const root = (await Settings.findOneAsync({ name: "gdrive.root" })) as
          | undefined
          | (SettingType & { name: "gdrive.root" });
        const folderId = await createFolder(
          await huntFolderName(hunt.name),
          root?.value.id,
        );
        const huntFolderId = await HuntFolders.insertAsync({
          _id: hunt._id,
          folder: folderId,
        });
        lockedFolder = (await HuntFolders.findOneAsync(huntFolderId))!;
      }
      return lockedFolder;
    });
  }

  return folder.folder;
}

export async function ensureHuntFolderPermission(
  huntId: string,
  userId: string,
  googleAccount: string,
) {
  const hunt = await Hunts.findOneAllowingDeletedAsync(huntId);
  if (!hunt) return;

  const folder = await ensureHuntFolder(hunt);

  const perm = {
    folder,
    user: userId,
    googleAccount: googleAccount.toLowerCase(),
    permissionLevel: "writer" as const,
  };
  await withLock(`folder:${folder}:permissions`, async (renew) => {
    if (await FolderPermissions.findOneAsync(perm)) return;
    const heartbeat = Meteor.setInterval(() => {
      void renew().catch(() => undefined);
    }, 3000);
    try {
      const client = GoogleClient.drive;
      if (!client) throw new Error("Google Drive 尚未授权");
      const existing = (await fetchAllPermissions(folder)).find(
        (p) =>
          p.type === "user" &&
          p.emailAddress?.toLowerCase() === perm.googleAccount,
      );
      // Preserve an owner's role and permissions already granted outside the app.
      if (
        existing &&
        ["owner", "organizer", "fileOrganizer", "writer"].includes(
          existing.role ?? "",
        )
      ) {
        await FolderPermissions.upsertAsync(perm, {
          $set: { ...perm, deleted: false },
          $setOnInsert: { createdBy: userId },
          $unset: { permissionId: 1, previousRole: 1 },
        });
        return;
      }
      const previousRole =
        existing?.role === "reader" || existing?.role === "commenter"
          ? existing.role
          : undefined;
      const response = existing?.id
        ? await client.permissions.update({
            fileId: folder,
            permissionId: existing.id,
            requestBody: { role: "writer" },
            fields: "id",
          })
        : await client.permissions.create({
            fileId: folder,
            requestBody: {
              type: "user",
              role: "writer",
              emailAddress: perm.googleAccount,
            },
            sendNotificationEmail: false,
            fields: "id",
          });
      const permissionId = response.data.id;
      if (!permissionId) throw new Error("Google 未返回文件夹授权编号");
      await FolderPermissions.upsertAsync(perm, {
        $setOnInsert: { createdBy: userId },
        $set: {
          ...perm,
          permissionId,
          deleted: false,
          ...(previousRole ? { previousRole } : {}),
        },
        ...(!previousRole ? { $unset: { previousRole: 1 } } : {}),
      });
    } finally {
      Meteor.clearInterval(heartbeat);
    }
  });
}

export async function ensureDocument(
  puzzle: {
    _id: string;
    title: string;
    hunt: string;
    documentUrl?: string;
  },
  type: GdriveMimeTypesType = "spreadsheet",
) {
  const existing = await Documents.findOneAsync({ puzzle: puzzle._id });
  if (existing && (existing.provider === "excalidraw" || puzzle.documentUrl))
    return existing;
  const hunt = await Hunts.findOneAllowingDeletedAsync(puzzle.hunt);
  const folderId = hunt ? await ensureHuntFolder(hunt) : undefined;

  let doc = await Documents.findOneAsync({ puzzle: puzzle._id });
  if (!doc) {
    await checkClientOk();

    await withRenewedLock(`puzzle:${puzzle._id}:documents`, async () => {
      // A queued creation may have waited behind a deletion or purge.
      const currentPuzzle = await Puzzles.findOneAsync(puzzle._id);
      if (
        !currentPuzzle ||
        currentPuzzle.docType === "none" ||
        currentPuzzle.documentUrl ||
        (currentPuzzle.docType && currentPuzzle.docType !== type)
      )
        return;
      doc = await Documents.findOneAsync({ puzzle: puzzle._id });
      if (!doc) {
        Logger.info("Creating missing document for puzzle", {
          puzzle: puzzle._id,
        });

        const googleDocId = await createDocument(
          puzzle.hunt,
          await puzzleDocumentName(puzzle.title),
          type,
          folderId,
        );
        const newDoc = {
          hunt: puzzle.hunt,
          puzzle: puzzle._id,
          provider: "google" as const,
          value: { type, id: googleDocId, folder: folderId, managed: true },
        };
        const docId = await Documents.insertAsync(newDoc);
        doc = (await Documents.findOneAsync(docId))!;
      }
    });
  }

  if (doc?.provider === "google" && folderId && doc.value.folder !== folderId) {
    await moveDocument(doc.value.id, folderId);
    await Documents.updateAsync(doc._id, {
      $set: { "value.folder": folderId },
    });
    doc = (await Documents.findOneAsync(doc._id))!;
  }

  return doc!;
}
