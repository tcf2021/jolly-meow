import type {
  WhiteboardElement,
  WhiteboardScene,
} from "./mergeWhiteboardScene";

export const WHITEBOARD_LIVE_ELEMENTS = "jr_whiteboard_live_elements";
export const WHITEBOARD_LIVE_FILES = "jr_whiteboard_live_files";
export const WHITEBOARD_PEERS = "jr_whiteboard_peers";
export const WHITEBOARD_ROOMS = "jr_whiteboard_rooms";
export const WHITEBOARD_SYNC_INTERVAL = 50;

export type WhiteboardPresence = {
  pointer?: { x: number; y: number; tool: "pointer" | "laser" };
  button: "up" | "down";
  selectedElementIds: Record<string, true>;
};
export type WhiteboardPeer = WhiteboardPresence & {
  _id: string;
  puzzleId: string;
  sessionId: string;
  userId: string;
  username: string;
};

export const whiteboardSceneSignature = (scene: WhiteboardScene) =>
  JSON.stringify([
    scene.elements
      .map(({ id, version, versionNonce }) => [id, version, versionNonce])
      .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
    Object.keys(scene.files).toSorted(),
  ]);

// Excalidraw may mutate elements while dragging. Keep independent snapshots so
// the version used for the previous broadcast cannot change underneath us.
export function captureWhiteboardScene(
  previous: WhiteboardScene,
  elements: readonly WhiteboardElement[],
  files: Record<string, unknown>,
): WhiteboardScene {
  const oldElements = new Map(
    previous.elements.map((element) => [element.id, element]),
  );
  return {
    elements: elements.map((element) => {
      const old = oldElements.get(element.id);
      if (
        old &&
        old.version === element.version &&
        old.versionNonce === element.versionNonce
      )
        return old;
      return structuredClone(element);
    }),
    files,
  };
}

// Images are immutable by file ID. Send only changed elements and new files.
export function whiteboardSceneDelta(
  previous: WhiteboardScene,
  next: WhiteboardScene,
): WhiteboardScene {
  const versions = new Map(
    previous.elements.map((element) => [element.id, element]),
  );
  return {
    elements: next.elements.filter((element) => {
      const old = versions.get(element.id);
      return (
        !old ||
        old.version !== element.version ||
        old.versionNonce !== element.versionNonce
      );
    }),
    files: Object.fromEntries(
      Object.entries(next.files).filter(([id]) => !(id in previous.files)),
    ),
  };
}
