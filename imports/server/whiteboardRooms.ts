import type { Subscription } from "meteor/meteor";
import { Meteor } from "meteor/meteor";
import i18n from "i18next";
import Logger from "../Logger";
import type { WhiteboardScene } from "../lib/mergeWhiteboardScene";
import mergeWhiteboardScene from "../lib/mergeWhiteboardScene";
import Hunts from "../lib/models/Hunts";
import Puzzles from "../lib/models/Puzzles";
import Whiteboards from "../lib/models/Whiteboards";
import { puzzleHasWhiteboard } from "../lib/PuzzleDocumentTypes";
import type {
  WhiteboardPeer,
  WhiteboardPresence,
} from "../lib/whiteboardCollaboration";
import {
  WHITEBOARD_LIVE_ELEMENTS,
  WHITEBOARD_LIVE_FILES,
  WHITEBOARD_PEERS,
  WHITEBOARD_ROOMS,
  whiteboardSceneDelta,
} from "../lib/whiteboardCollaboration";
import { serverLanguage } from "./lang";
import { parseWhiteboardScene } from "./whiteboardSchema";
import withLock from "./withLock";

type Peer = {
  sub: Subscription;
  connectionId: string;
  value: WhiteboardPeer;
};
type Room = {
  puzzleId: string;
  huntId: string;
  scene: WhiteboardScene;
  lastEditorId?: string;
  peers: Map<string, Peer>;
  revision: number;
  savedRevision: number;
  error: string;
  timer?: ReturnType<typeof Meteor.setTimeout>;
  saving: boolean;
  discarded: boolean;
  generation?: string;
};
const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room>>();
const unavailableWhiteboard = () =>
  new Meteor.Error(
    403,
    i18n.t("workspaceCleanup.whiteboardUnavailable", { lng: serverLanguage }),
  );
const itemId = (puzzleId: string, id: string) => JSON.stringify([puzzleId, id]);
const roomFields = (room: Room) => ({
  puzzleId: room.puzzleId,
  revision: room.revision,
  savedRevision: room.savedRevision,
  error: room.error,
});

export async function getWhiteboardRoom(puzzleId: string, huntId: string) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle || !puzzleHasWhiteboard(puzzle)) throw unavailableWhiteboard();
  const generation = puzzle.whiteboardGeneration;
  const existing = rooms.get(puzzleId);
  if (existing && !existing.discarded && existing.generation === generation)
    return existing;
  if (existing) await discardPuzzleWhiteboardRoom(puzzleId);
  let promise = loading.get(puzzleId);
  if (!promise) {
    promise = withLock(`whiteboard:${puzzleId}`, async () => {
      const currentPuzzle = await Puzzles.findOneAsync(puzzleId);
      if (!currentPuzzle || !puzzleHasWhiteboard(currentPuzzle))
        throw unavailableWhiteboard();
      const saved = await Whiteboards.findOneAsync(puzzleId);
      const room: Room = {
        puzzleId,
        huntId,
        scene: saved
          ? parseWhiteboardScene(saved.scene)
          : { elements: [], files: {} },
        peers: new Map(),
        revision: 0,
        savedRevision: 0,
        error: "",
        saving: false,
        discarded: false,
        generation: currentPuzzle.whiteboardGeneration,
      };
      rooms.set(puzzleId, room);
      return room;
    });
    loading.set(puzzleId, promise);
  }
  try {
    return await promise;
  } finally {
    if (loading.get(puzzleId) === promise) loading.delete(puzzleId);
  }
}

const publishStatus = (room: Room) => {
  room.peers.forEach(({ sub }) =>
    sub.changed(WHITEBOARD_ROOMS, room.puzzleId, roomFields(room)),
  );
};

async function persistRoom(room: Room) {
  room.timer = undefined;
  if (room.discarded || room.saving || room.savedRevision === room.revision)
    return;
  room.saving = true;
  const revision = room.revision;
  const snapshot = room.scene;
  const editorId = room.lastEditorId;
  try {
    await withLock(`whiteboard:${room.puzzleId}`, async () => {
      const puzzle = await Puzzles.findOneAsync(room.puzzleId);
      if (
        room.discarded ||
        !(await Hunts.findOneAsync(room.huntId)) ||
        !puzzle ||
        !puzzleHasWhiteboard(puzzle) ||
        puzzle.whiteboardGeneration !== room.generation
      ) {
        room.discarded = true;
        return;
      }
      const saved = await Whiteboards.findOneAsync(room.puzzleId);
      const scene = JSON.stringify(
        mergeWhiteboardScene(
          saved
            ? parseWhiteboardScene(saved.scene)
            : { elements: [], files: {} },
          snapshot,
        ),
      );
      if (saved)
        await Whiteboards.updateAsync(room.puzzleId, {
          $set: { scene, updatedBy: editorId },
        });
      else
        await Whiteboards.insertAsync({
          _id: room.puzzleId,
          hunt: room.huntId,
          scene,
          createdBy: editorId,
        });
    });
    room.savedRevision = revision;
    room.error = "";
  } catch (error) {
    room.error = "保存失败，正在重试";
    Logger.error("Whiteboard persistence failed", {
      puzzleId: room.puzzleId,
      error,
    });
  } finally {
    room.saving = false;
    if (room.discarded) {
      if (rooms.get(room.puzzleId) === room) rooms.delete(room.puzzleId);
    } else {
      publishStatus(room);
      if (room.savedRevision !== room.revision)
        room.timer = Meteor.setTimeout(() => {
          void persistRoom(room);
        }, 1000);
      else if (room.peers.size === 0 && rooms.get(room.puzzleId) === room)
        rooms.delete(room.puzzleId);
    }
  }
}
function scheduleSave(room: Room) {
  if (!room.discarded && !room.timer && !room.saving)
    room.timer = Meteor.setTimeout(() => {
      void persistRoom(room);
    }, 1000);
}

// Drain in-flight writes before the hunt purge removes saved scenes. Closing
// subscriptions can otherwise flush a delayed save after the purge has finished.
export async function discardPuzzleWhiteboardRoom(puzzleId: string) {
  await loading.get(puzzleId)?.catch(() => undefined);
  const room = rooms.get(puzzleId);
  if (!room) return;
  room.discarded = true;
  if (room.timer) Meteor.clearTimeout(room.timer);
  await withLock(`whiteboard:${puzzleId}`, () => {
    rooms.delete(puzzleId);
    return Promise.resolve();
  });
}

export async function discardHuntWhiteboardRooms(huntId: string) {
  await Promise.all(
    [...loading.values()].map((promise) => promise.catch(() => undefined)),
  );
  for (const room of rooms.values()) {
    if (room.huntId !== huntId) continue;
    room.discarded = true;
    if (room.timer) Meteor.clearTimeout(room.timer);
    await withLock(`whiteboard:${room.puzzleId}`, () => {
      rooms.delete(room.puzzleId);
      return Promise.resolve();
    });
  }
}

export function mergeLiveWhiteboard(
  puzzleId: string,
  incoming: WhiteboardScene,
  editorId: string,
  generation?: string,
) {
  const room = rooms.get(puzzleId);
  if (!room || room.discarded || room.generation !== generation)
    return incoming;
  const merged = mergeWhiteboardScene(room.scene, incoming);
  const delta = whiteboardSceneDelta(room.scene, merged);
  if (delta.elements.length === 0 && Object.keys(delta.files).length === 0)
    return room.scene;
  if (
    merged.elements.length > 10000 ||
    JSON.stringify(merged).length > 6 * 1024 * 1024
  )
    throw new Meteor.Error(413, "白板内容过大，请减少图片或图形");
  const oldElements = new Set(room.scene.elements.map(({ id }) => id));
  const oldFiles = new Set(Object.keys(room.scene.files));
  room.scene = merged;
  room.lastEditorId = editorId;
  room.revision += 1;
  room.peers.forEach(({ sub }) => {
    delta.elements.forEach((element) => {
      const fields = { puzzleId, element: JSON.stringify(element) };
      if (oldElements.has(element.id))
        sub.changed(
          WHITEBOARD_LIVE_ELEMENTS,
          itemId(puzzleId, element.id),
          fields,
        );
      else
        sub.added(
          WHITEBOARD_LIVE_ELEMENTS,
          itemId(puzzleId, element.id),
          fields,
        );
    });
    Object.entries(delta.files).forEach(([id, file]) => {
      const fields = { puzzleId, fileId: id, file: JSON.stringify(file) };
      if (oldFiles.has(id))
        sub.changed(WHITEBOARD_LIVE_FILES, itemId(puzzleId, id), fields);
      else sub.added(WHITEBOARD_LIVE_FILES, itemId(puzzleId, id), fields);
    });
  });
  publishStatus(room);
  scheduleSave(room);
  return merged;
}

export function joinWhiteboardRoom(
  room: Room,
  sub: Subscription,
  sessionId: string,
  userId: string,
  username: string,
) {
  if (room.discarded) throw unavailableWhiteboard();
  const id = itemId(room.puzzleId, sessionId);
  if (room.peers.has(id))
    throw new Meteor.Error(409, "白板会话已存在，请刷新重试");
  const peer: Peer = {
    sub,
    connectionId: sub.connection.id,
    value: {
      _id: id,
      puzzleId: room.puzzleId,
      sessionId,
      userId,
      username,
      button: "up",
      selectedElementIds: {},
    },
  };
  room.scene.elements.forEach((element) =>
    sub.added(WHITEBOARD_LIVE_ELEMENTS, itemId(room.puzzleId, element.id), {
      puzzleId: room.puzzleId,
      element: JSON.stringify(element),
    }),
  );
  Object.entries(room.scene.files).forEach(([fileId, file]) =>
    sub.added(WHITEBOARD_LIVE_FILES, itemId(room.puzzleId, fileId), {
      puzzleId: room.puzzleId,
      fileId,
      file: JSON.stringify(file),
    }),
  );
  sub.added(WHITEBOARD_ROOMS, room.puzzleId, roomFields(room));
  room.peers.forEach(({ value }) => {
    const { _id, ...fields } = value;
    sub.added(WHITEBOARD_PEERS, _id, fields);
  });
  room.peers.set(id, peer);
  const { _id, ...fields } = peer.value;
  room.peers.forEach(({ sub: recipient }) =>
    recipient.added(WHITEBOARD_PEERS, _id, fields),
  );
  return () => {
    if (room.peers.get(id) !== peer) return;
    room.peers.delete(id);
    if (room.discarded || rooms.get(room.puzzleId) !== room) return;
    room.peers.forEach(({ sub: recipient }) =>
      recipient.removed(WHITEBOARD_PEERS, id),
    );
    if (room.peers.size === 0) {
      if (room.savedRevision !== room.revision) {
        clearTimeout(room.timer);
        void persistRoom(room);
      } else if (!room.saving) rooms.delete(room.puzzleId);
    }
  };
}

export function syncWhiteboardPeer(
  puzzleId: string,
  sessionId: string,
  userId: string,
  connectionId: string,
  scene?: WhiteboardScene,
  presence?: WhiteboardPresence,
  generation?: string,
) {
  const room = rooms.get(puzzleId);
  const id = itemId(puzzleId, sessionId);
  const peer = room?.peers.get(id);
  if (
    !room ||
    room.discarded ||
    room.generation !== generation ||
    !peer ||
    peer.connectionId !== connectionId ||
    peer.value.userId !== userId
  )
    throw new Meteor.Error(403, "白板连接尚未就绪，请等待重新连接");
  if (scene) mergeLiveWhiteboard(puzzleId, scene, userId, generation);
  if (presence) {
    peer.value = { ...peer.value, ...presence };
    room.peers.forEach(({ sub }) =>
      sub.changed(WHITEBOARD_PEERS, id, presence),
    );
  }
}
