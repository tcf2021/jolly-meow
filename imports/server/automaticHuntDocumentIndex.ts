import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import { ServiceConfiguration } from "meteor/service-configuration";
import Flags from "../Flags";
import Logger from "../Logger";
import Documents from "../lib/models/Documents";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import Settings from "../lib/models/Settings";
import {
  recordHuntIndexError,
  syncHuntDocumentIndex,
} from "./huntDocumentIndex";

const pending = new Map<string, number>();
const failures = new Map<string, number>();

function schedule(huntId: string, delay = 1500) {
  const old = pending.get(huntId);
  if (old !== undefined) Meteor.clearTimeout(old);
  pending.set(
    huntId,
    Meteor.setTimeout(async () => {
      pending.delete(huntId);
      if ((await Hunts.findOneAsync(huntId))?.archived) return;
      try {
        await syncHuntDocumentIndex(huntId);
        failures.delete(huntId);
      } catch {
        // Google errors can carry authorization headers. Never log the raw error.
        Logger.warn("Hunt index sync failed; retrying", { huntId });
        await recordHuntIndexError(huntId).catch(() => undefined);
        const count = (failures.get(huntId) ?? 0) + 1;
        failures.set(huntId, count);
        if (!pending.has(huntId))
          schedule(
            huntId,
            Math.min(300000, 5000 * 2 ** Math.min(count - 1, 6)),
          );
      }
    }, delay),
  );
}

async function scheduleAll() {
  for (const hunt of await Hunts.find({}, { fields: { _id: 1 } }).fetchAsync())
    schedule(hunt._id);
}

// Startup registration is the module's primary purpose; manual refresh shares its retry queue.
export { schedule as scheduleHuntDocumentIndex };

Meteor.startup(async () => {
  await Hunts.find({}, { fields: { name: 1 } }).observeChangesAsync({
    added: (id) => schedule(id),
    changed: (id) => schedule(id),
  });
  // Track hunt IDs even when a document/puzzle is soft-deleted.
  const cursors: Mongo.Cursor<{ _id: string; hunt: string }>[] = [
    Puzzles.find(),
    Documents.find(),
  ];
  for (const cursor of cursors) {
    const hunts = new Map<string, string>();
    await cursor.observeChangesAsync({
      added(id, fields) {
        if (fields.hunt) {
          hunts.set(id, fields.hunt);
          schedule(fields.hunt);
        }
      },
      changed(id, fields) {
        const before = hunts.get(id);
        if (fields.hunt) hunts.set(id, fields.hunt);
        if (before) schedule(before);
        const after = hunts.get(id);
        if (after && after !== before) schedule(after);
      },
      removed(id) {
        const huntId = hunts.get(id);
        hunts.delete(id);
        if (huntId) schedule(huntId);
      },
    });
  }
  const members = new Map<string, string[]>();
  await MeteorUsers.find(
    {},
    {
      fields: {
        hunts: 1,
        googleAccount: 1,
        displayName: 1,
        "services.password.enroll": 1,
        "services.password.bcrypt": 1,
      },
    },
  ).observeChangesAsync({
    added(id, fields) {
      members.set(id, fields.hunts ?? []);
      fields.hunts?.forEach((huntId) => schedule(huntId));
    },
    changed(id, fields) {
      const before = members.get(id) ?? [];
      const after = fields.hunts ?? before;
      members.set(id, after);
      new Set([...before, ...after]).forEach((huntId) => schedule(huntId));
    },
    removed(id) {
      members.get(id)?.forEach((huntId) => schedule(huntId));
      members.delete(id);
    },
  });
  const reschedule = () => {
    void scheduleAll();
  };
  await Settings.find({
    name: { $in: ["gdrive.credential", "gdrive.root"] },
  }).observeChangesAsync({
    added: reschedule,
    changed: reschedule,
    removed: reschedule,
  });
  await ServiceConfiguration.configurations
    .find({ service: "google" })
    .observeChangesAsync({
      added: reschedule,
      changed: reschedule,
      removed: reschedule,
    });
  await Flags.observeChangesAsync("disable.google", reschedule);
  await Flags.observeChangesAsync("disable.gdrive_permissions", reschedule);
});
