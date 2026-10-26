import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation as useStudioTranslation } from "react-i18next";
import { useTheme } from "styled-components";
import type {
  WhiteboardElement,
  WhiteboardScene,
} from "../../lib/mergeWhiteboardScene";
import mergeWhiteboardScene from "../../lib/mergeWhiteboardScene";
import Puzzles from "../../lib/models/Puzzles";
import Whiteboards from "../../lib/models/Whiteboards";
import type {
  WhiteboardPeer,
  WhiteboardPresence,
} from "../../lib/whiteboardCollaboration";
import {
  captureWhiteboardScene,
  WHITEBOARD_LIVE_ELEMENTS,
  WHITEBOARD_LIVE_FILES,
  WHITEBOARD_PEERS,
  WHITEBOARD_ROOMS,
  WHITEBOARD_SYNC_INTERVAL,
  whiteboardSceneDelta,
  whiteboardSceneSignature,
} from "../../lib/whiteboardCollaboration";
import saveWhiteboard from "../../methods/saveWhiteboard";
import syncWhiteboard from "../../methods/syncWhiteboard";
import studioI18n from "../i18n";
import Loading from "./Loading";
import "@excalidraw/excalidraw/dist/prod/index.css";

const LiveElements = new Mongo.Collection<{
  _id: string;
  puzzleId: string;
  element: string;
}>(WHITEBOARD_LIVE_ELEMENTS);
const LiveFiles = new Mongo.Collection<{
  _id: string;
  puzzleId: string;
  fileId: string;
  file: string;
}>(WHITEBOARD_LIVE_FILES);
const Peers = new Mongo.Collection<WhiteboardPeer>(WHITEBOARD_PEERS);
const Rooms = new Mongo.Collection<{
  _id: string;
  puzzleId: string;
  revision: number;
  savedRevision: number;
  error: string;
}>(WHITEBOARD_ROOMS);
const emptyScene: WhiteboardScene = { elements: [], files: {} };
const colors = [
  "#1971c2",
  "#e03131",
  "#2f9e44",
  "#9c36b5",
  "#e67700",
  "#087f8c",
];
const peerColor = (id: string) =>
  colors[
    id.split("").reduce((sum, c) => sum + (c.codePointAt(0) ?? 0), 0) %
      colors.length
  ]!;

const Editor = ({
  puzzleId,
  sessionId,
  remoteScene,
  durableScene,
  connected,
  peers,
  roomError,
  generation,
}: {
  puzzleId: string;
  sessionId: string;
  remoteScene: WhiteboardScene;
  durableScene: WhiteboardScene;
  connected: boolean;
  peers: WhiteboardPeer[];
  roomError: string;
  generation?: string;
}) => {
  useStudioTranslation();
  const theme = useTheme();

  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const initialized = useRef(false);
  const [error, setError] = useState("");
  const initial = useRef(remoteScene);
  const current = useRef(initial.current);
  const lastSent = useRef(emptyScene);
  const presence = useRef<WhiteboardPresence>({
    button: "up",
    selectedElementIds: {},
  });
  const lastPresence = useRef("");
  const inFlight = useRef(false);
  const ready = useRef(connected);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const applying = useRef(false);
  const persisted = useRef(whiteboardSceneSignature(durableScene));
  const [sceneSignature, setSceneSignature] = useState(
    whiteboardSceneSignature(initial.current),
  );
  ready.current = connected && editorReady;
  persisted.current = whiteboardSceneSignature(durableScene);

  const flushLive = useCallback(async () => {
    timer.current = undefined;
    if (!ready.current || inFlight.current || !mounted.current) return;
    const snapshot = current.current;
    const delta = whiteboardSceneDelta(lastSent.current, snapshot);
    const nextPresence = presence.current;
    const presenceSignature = JSON.stringify(nextPresence);
    const hasScene =
      delta.elements.length > 0 || Object.keys(delta.files).length > 0;
    const hasPresence = presenceSignature !== lastPresence.current;
    if (!hasScene && !hasPresence) return;
    inFlight.current = true;
    let retryDelay = WHITEBOARD_SYNC_INTERVAL;
    try {
      await syncWhiteboard.callPromise({
        puzzleId,
        sessionId,
        generation,
        ...(hasScene ? { scene: JSON.stringify(delta) } : {}),
        ...(hasPresence ? { presence: nextPresence } : {}),
      });
      lastSent.current = mergeWhiteboardScene(lastSent.current, snapshot);
      lastPresence.current = presenceSignature;
      if (mounted.current) setError("");
    } catch (failure) {
      retryDelay = 1000;
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      inFlight.current = false;
      const unsent = whiteboardSceneDelta(lastSent.current, current.current);
      if (
        mounted.current &&
        ready.current &&
        (unsent.elements.length > 0 ||
          Object.keys(unsent.files).length > 0 ||
          JSON.stringify(presence.current) !== lastPresence.current)
      )
        timer.current = setTimeout(() => {
          void flushLive();
        }, retryDelay);
    }
  }, [puzzleId, sessionId, generation]);
  const scheduleSync = useCallback(() => {
    if (!timer.current && !inFlight.current)
      timer.current = setTimeout(() => {
        void flushLive();
      }, WHITEBOARD_SYNC_INTERVAL);
  }, [flushLive]);

  useEffect(() => {
    // A reconnected DDP session may have a new room. Resend local edits and
    // presence after receiving its initial subscription snapshot.
    lastSent.current = emptyScene;
    lastPresence.current = "";
    if (connected && editorReady) scheduleSync();
  }, [connected, editorReady, scheduleSync]);

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (whiteboardSceneSignature(current.current) !== persisted.current) {
        event.preventDefault();
        // oxlint-disable-next-line no-deprecated -- required by older browsers to show the unsaved-work prompt
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", beforeUnload);
      // Room autosave survives tab departure. This fallback also keeps offline
      // edits in Meteor's queued durable method calls when leaving the page.
      if (whiteboardSceneSignature(current.current) !== persisted.current)
        void saveWhiteboard
          .callPromise({
            puzzleId,
            scene: JSON.stringify(current.current),
            generation,
          })
          .catch(() => {
            // The room retains acknowledged changes and retries its autosave.
          });
    };
  }, [puzzleId, generation]);

  useEffect(() => {
    if (!api || !editorReady) return;
    const merged = mergeWhiteboardScene(current.current, remoteScene);
    if (
      whiteboardSceneSignature(current.current) ===
      whiteboardSceneSignature(merged)
    )
      return;
    applying.current = true;
    current.current = merged;
    lastSent.current = mergeWhiteboardScene(lastSent.current, remoteScene);
    api.addFiles(
      Object.values(merged.files) as BinaryFiles[keyof BinaryFiles][],
    );
    api.updateScene({
      elements: structuredClone(
        merged.elements,
      ) as unknown as ExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    setSceneSignature(whiteboardSceneSignature(merged));
    applying.current = false;
  }, [api, editorReady, remoteScene]);

  useEffect(() => {
    if (!api || !editorReady) return;
    const collaborators = new Map<SocketId, Collaborator>();
    peers
      .filter((peer) => peer.sessionId !== sessionId)
      .forEach((peer) => {
        const color = peerColor(peer.userId);
        collaborators.set(peer._id as SocketId, {
          id: peer.userId,
          username: peer.username,
          pointer: peer.pointer,
          button: peer.button,
          selectedElementIds: peer.selectedElementIds,
          color: { background: color, stroke: color },
        });
      });
    api.updateScene({
      collaborators,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, editorReady, peers, sessionId]);

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      // Excalidraw's asynchronous initial scene load resets collaborators.
      // onChange starts firing only once that initialization has completed.
      if (!initialized.current) {
        initialized.current = true;
        setEditorReady(true);
      }
      if (applying.current) return;
      const next = captureWhiteboardScene(
        current.current,
        elements as unknown as WhiteboardElement[],
        files,
      );
      const nextSignature = whiteboardSceneSignature(next);
      if (nextSignature !== whiteboardSceneSignature(current.current)) {
        current.current = next;
        setSceneSignature(nextSignature);
        scheduleSync();
      }
      if (
        JSON.stringify(presence.current.selectedElementIds) !==
        JSON.stringify(appState.selectedElementIds)
      ) {
        presence.current = {
          ...presence.current,
          selectedElementIds: appState.selectedElementIds,
        };
        scheduleSync();
      }
    },
    [scheduleSync],
  );
  const onPointerUpdate = useCallback<
    NonNullable<ExcalidrawProps["onPointerUpdate"]>
  >(
    ({ pointer, button }) => {
      presence.current = { ...presence.current, pointer, button };
      scheduleSync();
    },
    [scheduleSync],
  );

  const saved = sceneSignature === persisted.current;
  const status = !connected
    ? studioI18n.t("studio.messages.m440")
    : roomError ||
      (saved
        ? studioI18n.t("studio.messages.m441")
        : studioI18n.t("studio.messages.m442"));
  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="px-2 py-1 border-bottom small"
        role="status"
        data-testid="whiteboard-status"
      >
        {studioI18n.t("studio.messages.m443")}
        {status} {studioI18n.t("studio.messages.m444")}{" "}
        {connected ? new Set(peers.map((peer) => peer.userId)).size : 0}{" "}
        {studioI18n.t("studio.messages.m445")}
        {peers.length > 0 && (
          <span
            className="ms-2"
            title={peers.map((peer) => peer.username).join("、")}
          >
            {[...new Set(peers.map((peer) => peer.username))].join("、")}
          </span>
        )}
        {error && (
          <span className="text-danger ms-2">
            {error}{" "}
            <Button
              size="sm"
              onClick={() => {
                void flushLive();
              }}
            >
              {studioI18n.t("studio.messages.m446")}
            </Button>
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Excalidraw
          excalidrawAPI={setApi}
          theme={theme.basicMode === "dark" ? "dark" : "light"}
          langCode={studioI18n.language.startsWith("zh") ? "zh-CN" : "en"}
          isCollaborating={connected}
          initialData={{
            elements: structuredClone(
              initial.current.elements,
            ) as unknown as ExcalidrawElement[],
            files: initial.current.files as BinaryFiles,
          }}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          UIOptions={{
            canvasActions: { loadScene: false, saveToActiveFile: false },
          }}
        />
      </div>
    </div>
  );
};

const Whiteboard = ({ puzzleId }: { puzzleId: string }) => {
  useStudioTranslation();

  const [sessionId] = useState(() => Random.id());
  const loading = useSubscribe("whiteboardForPuzzle", { puzzleId });
  const liveLoading = useSubscribe("whiteboardCollaboration", {
    puzzleId,
    sessionId,
  });
  const { durableScene, remoteScene, peers, room, online, generation } =
    useTracker(() => {
      const durable: WhiteboardScene = JSON.parse(
        Whiteboards.findOne(puzzleId)?.scene ?? '{"elements":[],"files":{}}',
      );
      const live: WhiteboardScene = {
        elements: LiveElements.find({ puzzleId })
          .fetch()
          .map(({ element }) => JSON.parse(element) as WhiteboardElement),
        files: Object.fromEntries(
          LiveFiles.find({ puzzleId })
            .fetch()
            .map(({ fileId, file }) => [fileId, JSON.parse(file) as unknown]),
        ),
      };
      return {
        durableScene: durable,
        remoteScene: mergeWhiteboardScene(durable, live),
        peers: Peers.find({ puzzleId }).fetch(),
        room: Rooms.findOne(puzzleId),
        online: Meteor.status().connected,
        generation: Puzzles.findOne(puzzleId)?.whiteboardGeneration,
      };
    }, [puzzleId]);
  if (loading()) return <Loading />;
  return (
    <Editor
      key={`${puzzleId}:${generation ?? "initial"}`}
      puzzleId={puzzleId}
      sessionId={sessionId}
      durableScene={durableScene}
      remoteScene={remoteScene}
      connected={online && !liveLoading() && !!room}
      peers={peers}
      roomError={room?.error ?? ""}
      generation={generation}
    />
  );
};
export default Whiteboard;
