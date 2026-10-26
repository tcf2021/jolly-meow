const escapeQuery = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

import { createHash } from "node:crypto";
import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import { buildHuntDocumentIndex } from "../lib/huntDocumentIndex";
import Documents from "../lib/models/Documents";
import HuntFolders from "../lib/models/HuntFolders";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import { ensureHuntFolder } from "./gdrive";
import GoogleClient from "./googleClientRefresher";
import syncHuntFolderMembers from "./syncHuntFolderMembers";
import withLock from "./withLock";

const mimeType = "application/vnd.google-apps.spreadsheet";
const managedRole = "hunt-index";

export async function syncHuntDocumentIndex(huntId: string, force = false) {
  if (!GoogleClient.ready() || (await Flags.activeAsync("disable.google")))
    return false;
  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt || hunt.archived) return false;
  await withLock(`hunt:${huntId}:index`, async (renew) => {
    // A deletion may have completed while this sync was waiting for the lock.
    const currentHunt = await Hunts.findOneAsync(huntId);
    if (!currentHunt || currentHunt.archived) return;
    // Drive uploads can outlast the default lock lease.
    let lockError: unknown;
    const heartbeat = Meteor.setInterval(() => {
      void renew().catch((error: unknown) => {
        lockError = error;
      });
    }, 3000);
    try {
      const client = GoogleClient.drive;
      if (!client) return;
      const folderId = await ensureHuntFolder(hunt);
      const folder = (await HuntFolders.findOneAsync(huntId))!;
      let fileId = folder.indexSpreadsheet;
      if (!fileId) {
        // Recover a previous creation if the process stopped before saving its ID.
        const found = await client.files.list({
          q: `'${escapeQuery(folderId)}' in parents and trashed = false and appProperties has { key='jollymeowRole' and value='${managedRole}' } and appProperties has { key='jollymeowHunt' and value='${escapeQuery(huntId)}' }`,
          fields: "files(id)",
          pageSize: 100,
        });
        fileId = found.data.files?.[0]?.id ?? undefined;
        if (!fileId) {
          const created = await client.files.create({
            requestBody: {
              name: `00 题目总表 - ${hunt.name}`,
              mimeType,
              parents: [folderId],
              appProperties: {
                jollymeowRole: managedRole,
                jollymeowHunt: huntId,
              },
              description:
                "由 Jolly Meow 自动维护。手动修改会在下次同步时被覆盖，请在活动中编辑题目。",
            },
            fields: "id",
          });
          fileId = created.data.id ?? undefined;
        }
        if (!fileId) throw new Error("无法创建题目总表");
        await HuntFolders.updateAsync(huntId, {
          $set: { indexSpreadsheet: fileId },
          $unset: { indexContentHash: 1 },
        });
      }
      const file = await client.files
        .get({
          fileId,
          fields: "appProperties,mimeType,trashed,parents",
        })
        .catch(async (error: unknown) => {
          const code =
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined;
          if (code === 404 || code === "404")
            await HuntFolders.updateAsync(huntId, {
              $unset: { indexSpreadsheet: 1, indexContentHash: 1 },
            });
          throw new Error("无法读取题目总表，请检查 Google 授权");
        });
      if (file.data.trashed) {
        await HuntFolders.updateAsync(huntId, {
          $unset: { indexSpreadsheet: 1, indexContentHash: 1 },
        });
        throw new Error("题目总表已移至回收站，等待重新生成");
      }
      if (
        file.data.mimeType !== mimeType ||
        file.data.appProperties?.jollymeowRole !== managedRole ||
        file.data.appProperties?.jollymeowHunt !== huntId
      ) {
        throw new Error("题目总表标记不匹配，请检查活动的 Drive 配置");
      }
      if (!file.data.parents?.includes(folderId)) {
        await client.files.update({
          fileId,
          addParents: folderId,
          removeParents: file.data.parents?.join(","),
        });
      }
      const retryPermissions = await syncHuntFolderMembers(huntId, folderId);
      const puzzles = await Puzzles.find({ hunt: huntId }).fetchAsync();
      const documents = await Documents.find({ hunt: huntId }).fetchAsync();
      const csv = buildHuntDocumentIndex(
        puzzles,
        documents,
        Meteor.absoluteUrl(),
      );
      const hash = createHash("sha256")
        .update(`${hunt.name}\n${csv}`)
        .digest("hex");
      if (lockError)
        throw lockError instanceof Error
          ? lockError
          : new Error("Lost document-index synchronization lease");
      if (
        !force &&
        folder.indexSpreadsheet === fileId &&
        folder.indexContentHash === hash
      ) {
        await HuntFolders.updateAsync(huntId, { $unset: { indexError: 1 } });
        if (retryPermissions) throw new Error("成员授权暂时失败，等待重试");
        return;
      }
      // Updating an imported Google Sheet replaces its contents. Ownership above
      // ensures this can never overwrite a puzzle's manually linked document.
      await client.files.update({
        fileId,
        requestBody: {
          name: `00 题目总表 - ${hunt.name}`,
          mimeType,
        },
        media: { mimeType: "text/csv", body: csv },
        fields: "id",
      });
      if (lockError)
        throw lockError instanceof Error
          ? lockError
          : new Error("Lost document-index synchronization lease");
      await HuntFolders.updateAsync(huntId, {
        $set: { indexContentHash: hash, indexUpdatedAt: new Date() },
        $unset: { indexError: 1 },
      });
      if (retryPermissions) throw new Error("成员授权暂时失败，等待重试");
    } finally {
      Meteor.clearInterval(heartbeat);
    }
  });
  return true;
}

export async function recordHuntIndexError(huntId: string) {
  if (!(await Hunts.findOneAsync(huntId))) return;
  await HuntFolders.updateAsync(huntId, {
    $set: {
      indexError:
        "总表同步失败，正在重试。请检查 Google 授权和活动文件夹权限。",
    },
  });
}
