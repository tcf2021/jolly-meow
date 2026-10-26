import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Flags from "../Flags";
import Logger from "../Logger";
import Documents from "../lib/models/Documents";
import type { DriveSyncType } from "../lib/models/DriveSync";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import { scheduleHuntDocumentIndex } from "./automaticHuntDocumentIndex";
import GoogleClient from "./googleClientRefresher";
import withLock from "./withLock";

class LifecycleError extends Error {}

// Stored atomically with deleted, so a restart cannot lose an authorized action.
export function pendingDriveSync(): DriveSyncType {
  return { revision: Random.id(), retryAt: new Date(), attempts: 0 };
}

async function referencedElsewhere(fileId: string, puzzleId: string) {
  const references = await Documents.find({
    provider: "google",
    "value.id": fileId,
    puzzle: { $ne: puzzleId },
  }).fetchAsync();
  for (const reference of references) {
    if (
      (await Puzzles.findOneAsync(reference.puzzle)) &&
      (await Hunts.findOneAsync(reference.hunt))
    )
      return true;
  }
  return false;
}

async function setManagedTrash(
  fileId: string,
  trash: boolean,
  marked: boolean,
  mark: (value: boolean) => Promise<unknown>,
) {
  const client = GoogleClient.drive!;
  const file = await client.files
    .get({
      fileId,
      fields: "ownedByMe,trashed,mimeType",
      supportsAllDrives: true,
    })
    .catch((error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? Number(error.code)
          : undefined;
      if (code === 404 && trash) return undefined;
      throw error;
    });
  if (!file) return;
  // Unmarked items already in trash were removed independently by their owner.
  if ((trash && file.data.trashed) || (!trash && !marked)) return;
  if (!file.data.ownedByMe)
    throw new LifecycleError(
      "Drive 管理账号不是文件所有者，无法自动回收或恢复。",
    );
  if (trash) {
    // Persist intent before the API call so a crash after trashing is recoverable.
    await mark(true);
    await client.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
  } else {
    if (file.data.trashed)
      await client.files.update({
        fileId,
        requestBody: { trashed: false },
        supportsAllDrives: true,
      });
    await mark(false);
  }
}

async function syncPuzzleFiles(puzzleId: string) {
  const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
  if (!puzzle) return;
  const trash = puzzle.deleted;
  const documents = await Documents.findAllowingDeleted({
    puzzle: puzzleId,
    provider: "google",
  }).fetchAsync();
  const seen = new Set<string>();
  for (const document of documents) {
    if (document.provider !== "google") continue;
    const managed =
      document.value.managed === true ||
      (document.value.managed === undefined && !!document.value.folder);
    if (!managed || seen.has(document.value.id)) continue;
    seen.add(document.value.id);
    // A linked copy used by another active puzzle must remain available.
    if (trash && (await referencedElsewhere(document.value.id, puzzleId)))
      continue;
    await setManagedTrash(
      document.value.id,
      trash,
      !!document.value.trashedByApp,
      (value) =>
        Documents.updateAsync(
          {
            puzzle: puzzleId,
            provider: "google",
            "value.id": document.value.id,
          },
          value
            ? { $set: { "value.trashedByApp": true } }
            : { $unset: { "value.trashedByApp": 1 } },
          { multi: true },
        ),
    );
  }
}

export async function processDriveSync(id: string) {
  const model = Puzzles;
  const first = await model.findOneAllowingDeletedAsync(id);
  if (!first?.driveSync) return;
  const documents = await Documents.findAllowingDeleted({
    puzzle: id,
    provider: "google",
  }).fetchAsync();
  if (
    !documents.some(
      (document) =>
        document.provider === "google" &&
        (document.value.managed === true ||
          (document.value.managed === undefined && !!document.value.folder)),
    )
  ) {
    await model.updateAsync(
      { _id: id, "driveSync.revision": first.driveSync.revision },
      { $unset: { driveSync: 1 } },
    );
    scheduleHuntDocumentIndex(first.hunt, 0);
    return;
  }
  if (!GoogleClient.ready() || (await Flags.activeAsync("disable.google"))) {
    await model.updateAsync(
      { _id: id, "driveSync.revision": first.driveSync.revision },
      {
        $set: {
          driveSync: {
            ...first.driveSync,
            retryAt: new Date(Date.now() + 60000),
            error: "等待 Google 管理账号连接后处理题目文件。",
          },
        },
      },
    );
    return;
  }
  const huntId = first.hunt;
  // Serialize file changes with the managed activity index.
  await withLock(`hunt:${huntId}:index`, async (renew) => {
    const target = await model.findOneAllowingDeletedAsync(id);
    if (!target?.driveSync) return;
    const sync = target.driveSync;
    const selector = { _id: id, "driveSync.revision": sync.revision };
    const heartbeat = Meteor.setInterval(() => {
      void renew().catch(() => undefined);
    }, 3000);
    try {
      await syncPuzzleFiles(id);
      await model.updateAsync(selector, { $unset: { driveSync: 1 } });
      scheduleHuntDocumentIndex(huntId, 0);
    } catch (error: unknown) {
      const attempts = sync.attempts + 1;
      await model.updateAsync(selector, {
        $set: {
          driveSync: {
            ...sync,
            attempts,
            retryAt: new Date(
              Date.now() +
                Math.min(300000, 5000 * 2 ** Math.min(attempts - 1, 6)),
            ),
            error:
              error instanceof LifecycleError
                ? error.message
                : "Drive 回收或恢复失败，等待重试。请检查管理账号授权、文件所有权和网络。",
          },
        },
      });
      // Raw Google errors can contain authentication headers.
      Logger.warn("Drive lifecycle sync will retry", { id });
    } finally {
      Meteor.clearInterval(heartbeat);
    }
  });
}

let running = false;
async function processDue() {
  if (running) return;
  running = true;
  try {
    const selector = { "driveSync.retryAt": { $lte: new Date() } };
    for (const puzzle of await Puzzles.findAllowingDeleted(selector, {
      limit: 20,
      sort: { "driveSync.retryAt": 1 },
    }).fetchAsync())
      await processDriveSync(puzzle._id);
  } finally {
    running = false;
  }
}

Meteor.startup(() => {
  const run = () => {
    void processDue().catch(() =>
      Logger.warn("Drive lifecycle worker will retry"),
    );
  };
  Meteor.setInterval(run, 5000);
  run();
});
