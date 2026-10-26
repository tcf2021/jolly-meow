import { Meteor } from "meteor/meteor";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faEraser } from "@fortawesome/free-solid-svg-icons/faEraser";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons/faExclamationTriangle";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons/faPuzzlePiece";
import { faSkullCrossbones } from "@fortawesome/free-solid-svg-icons/faSkullCrossbones";
import { faStar } from "@fortawesome/free-solid-svg-icons/faStar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import InputGroup from "react-bootstrap/InputGroup";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation as useStudioTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import styled, { css } from "styled-components";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";
import { indexedById } from "../../lib/listUtils";
import type { HintStatus, HintType } from "../../lib/models/Hints";
import Hints from "../../lib/models/Hints";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import { userMayUpdateGuessesForHunt } from "../../lib/permission_stubs";
import puzzlesForHunt from "../../lib/publications/puzzlesForHunt";
import {
  cancelHint,
  setHintPriority,
  updateHintField,
} from "../../methods/jrHints";
import { guessURL } from "../../model-helpers";
import { useBreadcrumb } from "../hooks/breadcrumb";
import { useOperatorActionsHiddenForHunt } from "../hooks/persisted-state";
import useFocusRefOnFindHotkey from "../hooks/useFocusRefOnFindHotkey";
import useSubscribeDisplayNames from "../hooks/useSubscribeDisplayNames";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import studioI18n from "../i18n";
import indexedDisplayNames from "../indexedDisplayNames";
import { useConfirmationDialog } from "./ConfirmationModal";
import CopyToClipboardButton from "./CopyToClipboardButton";
import Breakable from "./styling/Breakable";
import {
  EmptyState,
  ManagementCard,
  ManagementPage,
  PageHeader,
  QueueContent,
  QueueToolbar,
} from "./styling/ManagementPage";
import type { Breakpoint } from "./styling/responsive";
import { mediaBreakpointDown } from "./styling/responsive";

/* ========= 状态文案 ========= */

const statusLabel: Record<HintStatus, string> = {
  get sent() {
    return studioI18n.t("studio.messages.m19");
  },
  get queued() {
    return studioI18n.t("studio.messages.m20");
  },
  get answered() {
    return studioI18n.t("studio.messages.m21");
  },
  get cancelled() {
    return studioI18n.t("studio.messages.m22");
  },
  get autoClosed() {
    return studioI18n.t("studio.messages.m23");
  },
};

const statusWeight: Record<HintStatus, number> = {
  sent: 0,
  queued: 0,
  answered: 1,
  cancelled: 2,
  autoClosed: 2,
};

/* ========= 样式 ========= */

const compactViewBreakpoint: Breakpoint = "md";

const StyledTable = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns:
    [timestamp] minmax(6.5em, 8em)
    [submitter] minmax(6em, 8em)
    [puzzle] minmax(12em, 1.2fr)
    [text] minmax(20em, 2fr)
    [response] minmax(20em, 2fr)
    [status] minmax(9em, 1fr);
  column-gap: 8px;
  border-bottom: 1px solid var(--bs-border-color);

  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      grid-template-columns: 100%;
    `,
  )}
`;

const StyledHeaderRow = styled.div`
  display: contents;
`;

const StyledHeader = styled.div`
  position: sticky;
  top: 0;
  background-color: var(--bs-body-bg);
  font-weight: bold;

  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      display: none;
    `,
  )}
`;

const StyledRow = styled.div`
  display: contents;
  margin-bottom: 8px;
  background-color: var(--bs-body-bg);

  &::before {
    content: " ";
    border-top: 1px solid var(--bs-border-color);
    grid-column: 1 / -1;
  }

  :hover {
    background-color: var(--bs-tertiary-bg);
  }
`;

const StyledCell = styled.div`
  overflow: hidden;
  padding: 4px;
  background-color: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  height: 100%;
`;

const StyledPuzzleTimestampAndSubmitter = styled.div`
  display: contents;
  background-color: inherit;

  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      padding: 10px 8px;
      display: flex;

      & > * {
        padding: 0;
      }
    `,
  )}
`;

const StyledPuzzleTimestamp = styled(StyledCell)`
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      ::after {
        content: " submitted by ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledPuzzleCell = styled(StyledCell)`
  display: flex;
  align-items: start;

  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      &::before {
        content: "Puzzle: ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledTextCell = styled(StyledCell)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      &::before {
        content: "Hint: ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledResponseCell = styled(StyledCell)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  ${mediaBreakpointDown(
    compactViewBreakpoint,
    css`
      &::before {
        content: "Answer: ";
        white-space: pre;
      }
    `,
  )}
`;

const StyledStatusCell = styled(StyledCell)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/* ========= 组件 ========= */

const archivedStatuses: ReadonlySet<HintStatus> = new Set([
  "answered",
  "cancelled",
  "autoClosed",
]);

const HintQueuePage: React.FC = () => {
  useStudioTranslation();

  const huntId = useParams<"huntId">().huntId!;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.get("q") ?? "";
  const [showHistory, setShowHistory] = useState(false);
  const { confirm, ConfirmationDialog } = useConfirmationDialog();
  const [operatorActionsHidden] = useOperatorActionsHiddenForHunt(huntId);

  const hunt = useTracker(() => Hunts.findOne({ _id: huntId }), [huntId]);

  useBreadcrumb({
    title: studioI18n.t("studio.messages.m76"),
    path: `/hunts/${huntId}/hints`,
  });

  // 订阅 hints（reactive）
  const hintsLoading = useSubscribe("hintsForHintQueue", { huntId });
  const hintsReady = !hintsLoading(); // 只依赖这个 boolean

  const displayNamesLoading = useSubscribeDisplayNames(huntId);
  const displayNamesReady = !displayNamesLoading();

  // 需要完整的谜题列表用于渲染标题/过滤，否则只会显示本地已有缓存的题目
  const puzzlesLoading = useTypedSubscribe(puzzlesForHunt, {
    huntId,
    includeDeleted: false,
  });
  const puzzlesReady = !puzzlesLoading();

  const hints = useTracker(() => {
    if (!hintsReady) {
      return [];
    }
    return Hints.find({ huntId }).fetch();
  }, [huntId, hintsReady]);

  const puzzles = useTracker(() => {
    if (!puzzlesReady) {
      return new Map<string, PuzzleType>();
    }
    return indexedById(Puzzles.find({ hunt: huntId }).fetch()) as Map<
      string,
      PuzzleType
    >;
  }, [huntId, puzzlesReady]);

  const displayNames = useTracker(() => {
    return displayNamesReady
      ? indexedDisplayNames()
      : new Map<string, string>();
  }, [displayNamesReady]);

  const canManage = useTracker(
    () => userMayUpdateGuessesForHunt(Meteor.user() as any, hunt as HuntType),
    [hunt],
  );

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Meteor.Error) {
      return error.reason ?? error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  };

  const showAlert = useCallback((message: string) => {
    /* eslint-disable-next-line no-alert -- fall back to blocking alert until dedicated notification UX replaces it */
    window.alert(message);
  }, []);

  const onTogglePriority = useCallback(
    async (hint: HintType) => {
      if (!canManage) {
        return;
      }
      const nextPriority = !hint.priority;
      const label = nextPriority
        ? studioI18n.t("studio.messages.m81")
        : studioI18n.t("studio.messages.m82");
      const confirmed = await confirm({
        title: label,
        body: studioI18n.t("studio.templates.confirmAction", { p0: label }),
        actionLabel: label,
        confirmVariant: nextPriority ? "warning" : "danger",
      });
      if (!confirmed) {
        return;
      }
      try {
        await setHintPriority.callPromise({
          hintId: hint._id,
          priority: nextPriority,
        });
      } catch (error) {
        showAlert(getErrorMessage(error));
      }
    },
    [canManage, confirm, showAlert],
  );

  const onCancelHint = useCallback(
    async (hint: HintType) => {
      if (!canManage) {
        return;
      }
      const isSent = hint.status === "sent";
      const isQueued = hint.status === "queued";
      if (!isSent && !isQueued) {
        showAlert(studioI18n.t("studio.messages.m83"));
        return;
      }
      const confirmed = await confirm({
        title: studioI18n.t("studio.messages.m35"),
        body: isSent
          ? studioI18n.t("studio.messages.m84")
          : studioI18n.t("studio.messages.m36"),
        actionLabel: studioI18n.t("studio.messages.m35"),
      });
      if (!confirmed) {
        return;
      }
      try {
        await cancelHint.callPromise({ hintId: hint._id });
      } catch (error) {
        showAlert(getErrorMessage(error));
      }
    },
    [canManage, confirm, showAlert],
  );

  /* ---- 队列排序：先按状态，再按时间（旧→新） ---- */

  const sortedHints = useMemo(() => {
    if (hints.length === 0) return [];

    const getStatusTimestamp = (hint: HintType) => {
      const ts = hint.statusChangedAt ?? hint.updatedAt ?? hint.createdAt;
      return ts ? new Date(ts).getTime() : 0;
    };

    const isPending = (hint: HintType) => statusWeight[hint.status] === 0;

    return hints.slice().toSorted((a, b) => {
      const statusDiff = statusWeight[a.status] - statusWeight[b.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      const bothPending = isPending(a) && isPending(b);
      if (bothPending && a.priority !== b.priority) {
        return a.priority ? -1 : 1;
      }

      const ta = getStatusTimestamp(a);
      const tb = getStatusTimestamp(b);
      if (ta !== tb) {
        return ta - tb; // 旧的在前
      }

      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ca !== cb) {
        return ca - cb;
      }

      return a._id.localeCompare(b._id);
    });
  }, [hints]);

  /* ---- 更新字段 ---- */

  const updateFieldCb = useCallback(
    (
      hintId: string,
      field: keyof Pick<HintType, "text" | "response" | "status" | "priority">,
      value: any,
    ) => {
      updateHintField.call({ hintId, field, value });
    },
    [],
  );

  /* ---- 搜索框 ---- */

  const searchBarRef = useRef<HTMLInputElement>(null);
  useFocusRefOnFindHotkey(searchBarRef);

  const setSearchString = useCallback(
    (val: string) => {
      const u = new URLSearchParams(searchParams);
      if (val) {
        u.set("q", val);
      } else {
        u.delete("q");
      }
      setSearchParams(u);
    },
    [searchParams, setSearchParams],
  );

  const onSearchStringChange: NonNullable<FormControlProps["onChange"]> =
    useCallback(
      (e) => {
        setSearchString(e.currentTarget.value);
      },
      [setSearchString],
    );

  const clearSearch = useCallback(() => {
    setSearchString("");
  }, [setSearchString]);

  const compileMatcher = useCallback(
    (searchKeys: string[]): ((h: HintType) => boolean) => {
      const lowerKeys = searchKeys.map((k) => k.toLowerCase());
      return (hint) => {
        const puzzle = puzzles.get(hint.puzzleId);
        if (!puzzle) return false;

        const title = puzzle.title.toLowerCase();
        const text = (hint.text ?? "").toLowerCase();
        const resp = (hint.response ?? "").toLowerCase();
        const submitter = (
          displayNames.get(hint.createdBy) ?? ""
        ).toLowerCase();

        return lowerKeys.every((key) => {
          return (
            title.includes(key) ||
            text.includes(key) ||
            resp.includes(key) ||
            submitter.includes(key)
          );
        });
      };
    },
    [puzzles, displayNames],
  );

  const filteredHints = useCallback(
    (allHints: HintType[], puzzleMap: Map<string, PuzzleType>) => {
      const searchKeys = searchString.split(" ");
      const hintsForKnownPuzzles = allHints.filter((h) =>
        puzzleMap.has(h.puzzleId),
      );

      if (searchKeys.length === 1 && searchKeys[0] === "") {
        return hintsForKnownPuzzles;
      }

      const keys = searchKeys.filter((k) => k.length > 0);
      const matcher = compileMatcher(keys);
      return hintsForKnownPuzzles.filter(matcher);
    },
    [searchString, compileMatcher],
  );

  const getTextAreaValue = useCallback((fieldId: string) => {
    if (typeof document === "undefined") {
      return "";
    }
    const element = document.querySelector<HTMLTextAreaElement>(`#${fieldId}`);
    return element?.value ?? "";
  }, []);

  const visibleHints = filteredHints(sortedHints, puzzles).filter(
    (hint) => showHistory || !archivedStatuses.has(hint.status),
  );

  if (!hunt || !puzzlesReady) {
    return <div> {studioI18n.t("studio.messages.m85")}</div>;
  }

  if (!canManage) {
    return null;
  }

  if (operatorActionsHidden) {
    return (
      <>
        {ConfirmationDialog}
        <Alert variant="info" className="mt-3">
          {studioI18n.t("studio.messages.m86")}
        </Alert>
      </>
    );
  }

  return (
    <>
      <ManagementPage>
        <PageHeader>
          <div>
            <h1>{studioI18n.t("studio.messages.m76")}</h1>
            <p>{studioI18n.t("studio.management.hintsHelp")}</p>
          </div>
        </PageHeader>
        <ManagementCard style={{ padding: 0 }}>
          <QueueToolbar>
            <FormGroup className="mb-3">
              <InputGroup>
                <FormControl
                  id="jr-hint-search"
                  as="input"
                  type="text"
                  ref={searchBarRef}
                  placeholder={studioI18n.t("studio.messages.m87")}
                  value={searchString}
                  onChange={onSearchStringChange}
                />
                <Button variant="secondary" onClick={clearSearch}>
                  <FontAwesomeIcon icon={faEraser} />
                </Button>
              </InputGroup>
              <FormCheck
                className="mt-2"
                id="jr-hints-show-history"
                label={studioI18n.t("studio.messages.m88")}
                checked={showHistory}
                onChange={(e) => setShowHistory(e.currentTarget.checked)}
              />
            </FormGroup>

            <span>
              {studioI18n.t("studio.management.records", {
                count: visibleHints.length,
              })}
            </span>
          </QueueToolbar>
          <QueueContent>
            <StyledTable>
              <StyledHeaderRow>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m89")}
                </StyledHeader>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m90")}
                </StyledHeader>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m91")}
                </StyledHeader>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m71")}
                </StyledHeader>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m92")}
                </StyledHeader>
                <StyledHeader>
                  {studioI18n.t("studio.messages.m93")}
                </StyledHeader>
              </StyledHeaderRow>

              {visibleHints.map((hint) => {
                const puzzle = puzzles.get(hint.puzzleId)!;
                const submitter =
                  displayNames.get(hint.createdBy) ?? hint.createdBy;
                const statusTimestamp =
                  hint.statusChangedAt ?? hint.updatedAt ?? hint.createdAt;
                const time = calendarTimeFormat(
                  statusTimestamp,
                  studioI18n.t,
                  studioI18n.language,
                );
                const puzzlePagePath = `/hunts/${puzzle.hunt}/puzzles/${puzzle._id}`;
                const puzzleUrl =
                  hunt && puzzle.url
                    ? guessURL(hunt, puzzle) || puzzle.url
                    : undefined;
                const puzzleLinkTooltip = (
                  <Tooltip id={`hint-${hint._id}-puzzle-link`}>
                    {studioI18n.t("studio.messages.m94")}
                  </Tooltip>
                );
                const discussionTooltip = (
                  <Tooltip id={`hint-${hint._id}-puzzle-page`}>
                    {studioI18n.t("studio.messages.m95")}
                  </Tooltip>
                );

                const hintTextFieldId = `hint-${hint._id}-text`;
                const hintResponseFieldId = `hint-${hint._id}-response`;

                return (
                  <StyledRow key={hint._id}>
                    <StyledPuzzleTimestampAndSubmitter>
                      <StyledPuzzleTimestamp>{time}</StyledPuzzleTimestamp>
                      <StyledCell>
                        <Breakable>{submitter}</Breakable>
                      </StyledCell>
                    </StyledPuzzleTimestampAndSubmitter>

                    <StyledPuzzleCell>
                      {puzzleUrl && (
                        <OverlayTrigger
                          placement="top"
                          overlay={puzzleLinkTooltip}
                        >
                          <a
                            href={puzzleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="me-1"
                          >
                            <FontAwesomeIcon icon={faPuzzlePiece} />
                          </a>
                        </OverlayTrigger>
                      )}
                      <OverlayTrigger
                        placement="top"
                        overlay={discussionTooltip}
                      >
                        <Link to={puzzlePagePath} className="me-1">
                          <FontAwesomeIcon icon={faSkullCrossbones} />
                        </Link>
                      </OverlayTrigger>
                      <Link to={puzzlePagePath}>
                        <Breakable>{puzzle.title}</Breakable>
                      </Link>
                    </StyledPuzzleCell>

                    <StyledTextCell>
                      <FormControl
                        as="textarea"
                        rows={5}
                        id={hintTextFieldId}
                        key={`${hint._id}-text-${
                          hint.updatedAt
                            ? new Date(hint.updatedAt).getTime()
                            : 0
                        }`}
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                        defaultValue={hint.text}
                        onBlur={(e) =>
                          updateFieldCb(hint._id, "text", e.currentTarget.value)
                        }
                      />
                      <div className="d-flex justify-content-start">
                        <CopyToClipboardButton
                          variant="outline-secondary"
                          size="sm"
                          text={() => getTextAreaValue(hintTextFieldId)}
                        >
                          {studioI18n.t("studio.messages.m73")}
                        </CopyToClipboardButton>
                      </div>
                    </StyledTextCell>

                    <StyledResponseCell>
                      <FormControl
                        as="textarea"
                        rows={5}
                        id={hintResponseFieldId}
                        key={`${hint._id}-response-${
                          hint.updatedAt
                            ? new Date(hint.updatedAt).getTime()
                            : 0
                        }`}
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                        defaultValue={hint.response ?? ""}
                        placeholder={studioI18n.t("studio.messages.m96")}
                        onBlur={(e) =>
                          updateFieldCb(
                            hint._id,
                            "response",
                            e.currentTarget.value,
                          )
                        }
                      />
                      <div className="d-flex justify-content-start">
                        <CopyToClipboardButton
                          variant="outline-secondary"
                          size="sm"
                          text={() => getTextAreaValue(hintResponseFieldId)}
                        >
                          {studioI18n.t("studio.messages.m97")}
                        </CopyToClipboardButton>
                      </div>
                    </StyledResponseCell>

                    <StyledStatusCell>
                      <FormControl
                        as="select"
                        size="sm"
                        className="mb-2"
                        defaultValue={hint.status}
                        disabled={!canManage}
                        title={
                          canManage
                            ? undefined
                            : studioI18n.t("studio.messages.m98")
                        }
                        onChange={(e) => {
                          const selectElement = e.currentTarget;
                          const nextStatus = selectElement.value as HintStatus;
                          const confirmStatusChange = async () => {
                            if (
                              hint.status !== "answered" &&
                              nextStatus === "answered"
                            ) {
                              const confirmed = await confirm({
                                title: studioI18n.t("studio.messages.m99"),
                                body: studioI18n.t("studio.messages.m100"),
                                actionLabel: studioI18n.t(
                                  "studio.messages.m99",
                                ),
                              });
                              if (!confirmed) {
                                selectElement.value = hint.status;
                                return;
                              }
                            }
                            updateFieldCb(hint._id, "status", nextStatus);
                          };
                          void confirmStatusChange();
                        }}
                      >
                        <option value="queued">{statusLabel.queued}</option>
                        <option value="sent">{statusLabel.sent}</option>
                        <option value="answered">{statusLabel.answered}</option>
                        <option value="cancelled">
                          {statusLabel.cancelled}
                        </option>
                        <option value="autoClosed">
                          {statusLabel.autoClosed}
                        </option>
                      </FormControl>
                      <div
                        className="d-flex align-items-center flex-wrap"
                        style={{ gap: "8px" }}
                      >
                        <Button
                          variant={
                            hint.priority ? "warning" : "outline-secondary"
                          }
                          size="sm"
                          disabled={!canManage}
                          onClick={() => {
                            void onTogglePriority(hint);
                          }}
                        >
                          <FontAwesomeIcon icon={faStar} />{" "}
                          {studioI18n.t("studio.messages.m101")}
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          disabled={
                            !canManage ||
                            (hint.status !== "queued" && hint.status !== "sent")
                          }
                          onClick={() => {
                            void onCancelHint(hint);
                          }}
                          title={studioI18n.t("studio.messages.m102")}
                        >
                          <FontAwesomeIcon icon={faExclamationTriangle} />{" "}
                          {studioI18n.t("studio.messages.m37")}
                        </Button>
                      </div>
                    </StyledStatusCell>
                  </StyledRow>
                );
              })}
            </StyledTable>
            {visibleHints.length === 0 && (
              <EmptyState>
                {studioI18n.t("studio.management.emptyHints")}
              </EmptyState>
            )}
          </QueueContent>
        </ManagementCard>
      </ManagementPage>
      {ConfirmationDialog}
    </>
  );
};

export default HintQueuePage;
