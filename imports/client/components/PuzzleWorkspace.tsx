import type { Meteor } from "meteor/meteor";
import { faGripVertical } from "@fortawesome/free-solid-svg-icons/faGripVertical";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation as useStudioTranslation } from "react-i18next";
import { useLocalStorage } from "usehooks-ts";
import type { DocumentType } from "../../lib/models/Documents";
import type { PuzzleType } from "../../lib/models/Puzzles";
import { puzzleHasWhiteboard } from "../../lib/PuzzleDocumentTypes";
import ensurePuzzleDocument from "../../methods/ensurePuzzleDocument";
import studioI18n from "../i18n";
import DocumentDisplay, {
  DocumentMessage,
  WhiteboardDisplay,
} from "./DocumentDisplay";

type WorkspaceTab = "google" | "whiteboard";
const defaultOrder: WorkspaceTab[] = ["google", "whiteboard"];

const PuzzleWorkspace = ({
  puzzle,
  document,
  user,
}: {
  puzzle: PuzzleType;
  document?: DocumentType;
  user: Meteor.User;
}) => {
  const { t } = useStudioTranslation();

  const hasWhiteboard = puzzleHasWhiteboard(puzzle);
  const googleDocument = document?.provider === "google" ? document : undefined;
  const googleType =
    puzzle.docType === "spreadsheet" || puzzle.docType === "document"
      ? puzzle.docType
      : googleDocument?.value.type;
  const [tabOrders, setTabOrders] = useLocalStorage<
    Record<string, WorkspaceTab[]>
  >("puzzleWorkspaceTabOrder", {});
  const orderScope = `${user._id}:${puzzle._id}`;
  const available = new Set(
    defaultOrder.filter((tab) =>
      tab === "google" ? !!googleType : hasWhiteboard,
    ),
  );
  const order = [
    ...new Set([...(tabOrders[orderScope] ?? defaultOrder), ...defaultOrder]),
  ].filter((tab) => available.has(tab));
  const [selected, setSelected] = useState<{
    puzzleId: string;
    tab: WorkspaceTab;
  }>();
  const [googleOpened, setGoogleOpened] = useState<string>();
  const [dragged, setDragged] = useState<WorkspaceTab>();
  const [retrying, setRetrying] = useState(false);
  const active =
    selected?.puzzleId === puzzle._id && available.has(selected.tab)
      ? selected.tab
      : order[0];
  const moveTab = (tab: WorkspaceTab, target: WorkspaceTab) => {
    if (tab === target) return;
    if (active === "google") setGoogleOpened(puzzle._id);
    const next = order.filter((item) => item !== tab);
    next.splice(order.indexOf(target), 0, tab);
    setTabOrders((previous) => ({ ...previous, [orderScope]: next }));
  };
  const googleLabel =
    googleType === "document"
      ? studioI18n.t("studio.messages.m231")
      : studioI18n.t("studio.messages.m232");
  if (!hasWhiteboard && !googleType)
    return (
      <DocumentMessage>{studioI18n.t("studio.messages.m233")}</DocumentMessage>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        className="px-2 py-1 border-bottom d-flex align-items-center gap-2 flex-wrap"
        role="group"
        aria-label={studioI18n.t("studio.messages.m234")}
        data-testid="puzzle-workspace-switcher"
      >
        {order.map((tab, index) => (
          <Button
            key={tab}
            size="sm"
            variant={active === tab ? "primary" : "outline-primary"}
            aria-pressed={active === tab}
            data-testid={`workspace-${tab}`}
            data-workspace-tab={tab}
            draggable={order.length > 1}
            title={order.length > 1 ? t("workspace.dragHint") : undefined}
            onDragStart={(event) => {
              setDragged(tab);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", tab);
            }}
            onDragOver={(event) => {
              if (dragged && dragged !== tab) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              if (!dragged) return;
              event.preventDefault();
              moveTab(dragged, tab);
              setDragged(undefined);
            }}
            onDragEnd={() => setDragged(undefined)}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              const targetIndex =
                event.key === "ArrowLeft"
                  ? index - 1
                  : event.key === "ArrowRight"
                    ? index + 1
                    : index;
              const target = order[targetIndex];
              if (target && target !== tab) {
                event.preventDefault();
                moveTab(tab, target);
              }
            }}
            onClick={() => {
              if (tab === "google" || active === "google")
                setGoogleOpened(puzzle._id);
              setSelected({ puzzleId: puzzle._id, tab });
            }}
          >
            {order.length > 1 && (
              <span
                className="me-1"
                style={{
                  display: "inline-flex",
                  touchAction: "none",
                  cursor: "grab",
                }}
                aria-hidden="true"
                data-testid={`workspace-grip-${tab}`}
                onPointerDown={(event) => {
                  if (event.pointerType !== "touch") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragged(tab);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={(event) => {
                  if (event.pointerType !== "touch") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const target = window.document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLButtonElement>("[data-workspace-tab]")
                    ?.dataset.workspaceTab;
                  if (target === "google" || target === "whiteboard")
                    moveTab(tab, target);
                  setDragged(undefined);
                }}
                onPointerCancel={() => setDragged(undefined)}
              >
                <FontAwesomeIcon icon={faGripVertical} />
              </span>
            )}
            {tab === "google"
              ? googleLabel
              : studioI18n.t("studio.messages.m6")}
          </Button>
        ))}
        {googleDocument && (
          <span className="small ms-auto">
            <DocumentDisplay
              document={googleDocument}
              displayMode="link"
              user={user}
            />
          </span>
        )}
      </div>
      {/* Keep editors mounted across switches so pending edits and live peers survive. */}
      {hasWhiteboard && (
        <div
          style={{
            display: active === "whiteboard" ? "block" : "none",
            flex: 1,
            minHeight: 0,
            position: "relative",
          }}
        >
          <WhiteboardDisplay puzzleId={puzzle._id} />
        </div>
      )}
      {googleType && (googleOpened === puzzle._id || active === "google") && (
        <div
          style={{
            display: active === "google" ? "block" : "none",
            flex: 1,
            minHeight: 0,
            position: "relative",
          }}
        >
          {googleDocument ? (
            <DocumentDisplay
              document={googleDocument}
              displayMode="embed"
              user={user}
            />
          ) : (
            <DocumentMessage>
              {t(
                puzzle.workspaceError
                  ? "workspace.creationFailed"
                  : "workspace.creating",
              )}
              {puzzle.workspaceError && !puzzle.deleted && (
                <Button
                  className="ms-2"
                  size="sm"
                  disabled={retrying}
                  onClick={() => {
                    setRetrying(true);
                    ensurePuzzleDocument.call({ puzzleId: puzzle._id }, () =>
                      setRetrying(false),
                    );
                  }}
                >
                  {t("workspace.retry")}
                </Button>
              )}
            </DocumentMessage>
          )}
        </div>
      )}
    </div>
  );
};

export default PuzzleWorkspace;
