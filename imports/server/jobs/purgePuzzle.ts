import {
  DeleteObjectsCommand,
  paginateListObjectsV2,
  S3Client,
} from "@aws-sdk/client-s3";
import purgePuzzle from "../../lib/jobs/purgePuzzle";
import Hints from "../../lib/models/Hints";
import Hunts from "../../lib/models/Hunts";
import Jobs from "../../lib/models/Jobs";
import { AllModels } from "../../lib/models/Model";
import Transports from "../../lib/models/mediasoup/Transports";
import Puzzles from "../../lib/models/Puzzles";
import Settings from "../../lib/models/Settings";
import { scheduleHuntDocumentIndex } from "../automaticHuntDocumentIndex";
import { processDriveSync } from "../driveLifecycle";
import { discardPuzzleWhiteboardRoom } from "../whiteboardRooms";
import withRenewedLock from "../withRenewedLock";
import defineJob from "./framework/defineJob";

const puzzleCollections = new Set([
  "jr_bookmarks",
  "jr_bookmark_notifications",
  "jr_chatmessages",
  "jr_chatnotifications",
  "jr_document_activities",
  "jr_documents",
  "jr_guesses",
  "jr_hint_answer_notifications",
  "jr_hint_request_notifications",
]);

export async function purgePuzzleData(puzzleId: string, huntId: string) {
  await withRenewedLock(`puzzle:${puzzleId}:edit`, async () => {
    await withRenewedLock(`puzzle:${puzzleId}:documents`, async () => {
      const puzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
      if (puzzle && (!puzzle.deleted || puzzle.hunt !== huntId))
        throw new Error("Only deleted puzzles can be purged");
      if (puzzle?.driveSync && (await Hunts.findOneAsync(huntId))) {
        await processDriveSync(puzzleId);
        if ((await Puzzles.findOneDeletedAsync(puzzleId))?.driveSync)
          throw new Error("Waiting for managed Drive files to be recycled");
      }
      const assetPrefix = `${huntId}/${puzzleId}/`;
      const bucket = await Settings.findOneAsync({ name: "s3.image_bucket" });
      if (bucket?.value) {
        const client = new S3Client({ region: bucket.value.bucketRegion });
        for await (const page of paginateListObjectsV2(
          { client },
          {
            Bucket: bucket.value.bucketName,
            Prefix: assetPrefix,
          },
        )) {
          const objects = page.Contents?.flatMap((item) =>
            item.Key ? [{ Key: item.Key }] : [],
          );
          if (objects?.length) {
            const deleted = await client.send(
              new DeleteObjectsCommand({
                Bucket: bucket.value.bucketName,
                Delete: { Objects: objects, Quiet: true },
              }),
            );
            if (deleted.Errors?.length)
              throw new Error("Puzzle image cleanup failed");
          }
        }
      }
      // The durable job retains both IDs, so retries can finish after this
      // record is gone. Removing it first prevents new writes to the puzzle.
      await Puzzles.removeAsync(puzzleId);
      await discardPuzzleWhiteboardRoom(puzzleId);
      const transports = await Transports.findAllowingDeleted({
        call: puzzleId,
      }).fetchAsync();
      const transportIds = transports.map((t) => t.transportId);
      for (const model of AllModels) {
        let selector: Record<string, unknown> | undefined;
        if (puzzleCollections.has(model.name)) selector = { puzzle: puzzleId };
        else if (model.name.startsWith("jr_mediasoup_") && model !== Transports)
          selector =
            model.name.includes("monitor_connect") ||
            model.name.endsWith("transport_states")
              ? { transportId: { $in: transportIds } }
              : { call: puzzleId };
        else if (model.name === "jr_call_activities")
          selector = { call: puzzleId };
        else if (model.name === "jr_whiteboards") selector = { _id: puzzleId };
        else if (model.name === "jr_subscribers")
          selector = { name: `puzzle:${puzzleId}` };
        else if (
          model.name === "jr_blob_mappings" ||
          model.name === "jr_upload_tokens"
        ) {
          const prefix = new RegExp(
            `^${assetPrefix.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          );
          selector = {
            [model.name === "jr_blob_mappings" ? "_id" : "asset"]: prefix,
          };
        }
        if (selector)
          await model.collection.rawCollection().deleteMany(selector);
      }
      await Transports.removeAsync({ call: puzzleId });
      // Hints use puzzleId rather than the model-level puzzle foreign key.
      await Hints.removeAsync({ puzzleId });
      await Puzzles.updateAsync(
        { replacedBy: puzzleId },
        { $unset: { replacedBy: 1 } },
        { multi: true },
      );
      scheduleHuntDocumentIndex(huntId, 0);
    });
  });
}

defineJob(purgePuzzle, {
  deleteAfter: () => new Date(Date.now() + 86400000),
  async run({ puzzleId, huntId }, { jobId }) {
    try {
      await purgePuzzleData(puzzleId, huntId);
    } catch {
      const job = await Jobs.findOneAsync(jobId);
      await Puzzles.updateAsync(puzzleId, {
        $set: {
          purgeError:
            "Puzzle cleanup failed; check Google Drive access and retry.",
          purging: !!job && job.attempts < job.maxAttempts,
        },
      });
      throw new Error("Puzzle cleanup failed; waiting to retry");
    }
  },
});
