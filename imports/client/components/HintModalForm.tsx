import Mustache from "mustache";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import Row from "react-bootstrap/Row";
import { useTranslation as useStudioTranslation } from "react-i18next";
import { calendarTimeFormat } from "../../lib/calendarTimeFormat";
import type { DocumentType } from "../../lib/models/Documents";
import type { HintType } from "../../lib/models/Hints";
import getDocumentAnyoneReaderStatus from "../../methods/getDocumentAnyoneReaderStatus";
import setDocumentAnyoneReaderStatus from "../../methods/setDocumentAnyoneReaderStatus";
import studioI18n from "../i18n";
import { useConfirmationDialog } from "./ConfirmationModal";
import CopyToClipboardButton from "./CopyToClipboardButton";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";

const getHintTemplate = () =>
  [
    "Hi HQ!",
    "",
    studioI18n.t("studio.messages.m13"),
    studioI18n.t("studio.messages.m14"),
    studioI18n.t("studio.messages.m15"),
    studioI18n.t("studio.messages.m16"),
    studioI18n.t("studio.messages.m17"),
    studioI18n.t("studio.messages.m18"),
    "",
    "Thanks from team Miao!",
  ].join("\n");

const formatErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface HintModalFormSubmitPayload {
  huntId: string;
  puzzleId: string;
  puzzleTitle: string;
  text: string;
  mode: "new" | "cancel" | "edit";
  hintId?: string;
}

type HintStatus = "sent" | "queued" | "answered" | "cancelled" | "autoClosed";
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

type HintModalMode = "new" | "cancel" | "edit";

enum HintModalSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  FAILED = "failed",
}

export type HintModalFormHandle = {
  show: () => void;
  hide: () => void;
};

type Props = {
  huntId: string;
  puzzleId: string;
  puzzleTitle: string;
  documentType?: DocumentType;
  huntHasGoogleGroup: boolean;
  onSubmit: (
    payload: HintModalFormSubmitPayload,
    callback: (error?: Error) => void,
  ) => void;
  // 该题最近一次提示的状态：如果是 queued，则只允许撤销
  latestHintStatus?: HintStatus;
  // 是否已经有提示历史，用来控制撤销按钮和提示文案
  hasAnyHintHistory: boolean;
  // 当前谜题的提示记录（含历史）
  hintHistory: HintType[];
  // 谜题是否已经被标记为 solved，solved 时禁止继续提交
  puzzleSolved: boolean;
};

const HintModalForm = React.forwardRef(
  (
    {
      huntId,
      puzzleId,
      puzzleTitle,
      documentType,
      huntHasGoogleGroup,
      onSubmit,
      latestHintStatus,
      hasAnyHintHistory,
      hintHistory,
      puzzleSolved,
    }: Props,
    forwardedRef: React.Ref<HintModalFormHandle>,
  ) => {
    useStudioTranslation();

    const { confirm, ConfirmationDialog } = useConfirmationDialog();
    const [text, setText] = useState<string>("");
    const [mode, setMode] = useState<HintModalMode | null>(() =>
      puzzleSolved ? null : "new",
    );
    const [submitState, setSubmitState] = useState<HintModalSubmitState>(
      HintModalSubmitState.IDLE,
    );
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [successMode, setSuccessMode] = useState<Extract<
      HintModalMode,
      "new" | "edit"
    > | null>(null);
    const [anyoneReaderEnabled, setAnyoneReaderEnabled] = useState<
      boolean | null
    >(null);
    const [sheetPermissionPending, setSheetPermissionPending] = useState(false);
    const [sheetPermissionError, setSheetPermissionError] = useState<
      string | null
    >(null);

    const formRef = useRef<ModalFormHandle>(null);
    const hideFooterTimer = useRef<number | null>(null);

    const hideModalFooterCloseButton = useCallback(() => {
      if (typeof document === "undefined") {
        return true;
      }

      const modals = document.querySelectorAll<HTMLElement>(".modal.show");
      for (const modal of Array.from(modals)) {
        const titleEl = modal.querySelector(".modal-title");
        const titleText = titleEl?.textContent?.trim() ?? "";
        if (!titleText.startsWith(studioI18n.t("studio.messages.m24"))) {
          continue;
        }
        const closeButton = modal.querySelector<HTMLElement>(
          ".modal-footer .btn-light",
        );
        if (closeButton) {
          closeButton.style.display = "none";
          return true;
        }
      }
      return false;
    }, []);

    const scheduleHideFooterButton = useCallback(() => {
      if (hideFooterTimer.current !== null) {
        window.clearTimeout(hideFooterTimer.current);
        hideFooterTimer.current = null;
      }

      let attempts = 0;
      const maxAttempts = 20;

      const attemptHide = () => {
        if (hideModalFooterCloseButton() || attempts >= maxAttempts) {
          hideFooterTimer.current = null;
          return;
        }
        attempts += 1;
        hideFooterTimer.current = window.setTimeout(attemptHide, 50);
      };

      attemptHide();
    }, [hideModalFooterCloseButton]);

    useEffect(() => {
      return () => {
        if (hideFooterTimer.current !== null) {
          window.clearTimeout(hideFooterTimer.current);
          hideFooterTimer.current = null;
        }
      };
    }, []);

    const show = useCallback(() => {
      setSuccessMode(null);
      if (formRef.current) {
        formRef.current.show();
        scheduleHideFooterButton();
      }
    }, [scheduleHideFooterButton]);

    const hide = useCallback(() => {
      setSuccessMode(null);
      if (formRef.current) {
        formRef.current.hide();
      }
    }, []);

    useImperativeHandle(forwardedRef, () => ({
      show,
      hide,
    }));

    const latestPendingHint = useMemo(() => {
      for (let i = hintHistory.length - 1; i >= 0; i -= 1) {
        const hint = hintHistory[i];
        if (!hint) {
          continue;
        }
        if (hint.status === "queued" || hint.status === "sent") {
          return hint;
        }
      }
      return undefined;
    }, [hintHistory]);

    const latestQueuedHint =
      latestPendingHint?.status === "queued" ? latestPendingHint : undefined;

    const editableHintId = latestQueuedHint?._id;
    const editableHintText = latestQueuedHint?.text ?? "";
    const latestPendingHintId = latestPendingHint?._id;

    useEffect(() => {
      if (mode === "edit" && editableHintId) {
        setText(editableHintText);
        return;
      }
      if (mode === "edit" && !editableHintId) {
        setText("");
      }
    }, [mode, editableHintId, editableHintText]);

    const hintJustSent = latestHintStatus === "sent";
    const hasQueuedHint = latestHintStatus === "queued";
    const hasPendingHint = hintJustSent || hasQueuedHint;
    const hasCancelableHint = hasQueuedHint;
    const latestAnswered = latestHintStatus === "answered";
    const noHistory = !hasAnyHintHistory;

    const allowNew = !puzzleSolved && !hasPendingHint;
    const allowEdit = !puzzleSolved && Boolean(latestQueuedHint);
    const allowCancel = !puzzleSolved && hasAnyHintHistory && hasCancelableHint;

    const nextDefaultMode: HintModalMode | null = useMemo(() => {
      if (allowNew) return "new";
      if (allowEdit) return "edit";
      if (allowCancel) return "cancel";
      return null;
    }, [allowNew, allowEdit, allowCancel]);

    useEffect(() => {
      if (!allowEdit && mode === "edit") {
        setMode(nextDefaultMode);
      }
    }, [allowEdit, mode, nextDefaultMode]);

    const isModeAllowed = useCallback(
      (currentMode: HintModalMode | null): currentMode is HintModalMode => {
        if (!currentMode) return false;
        if (currentMode === "new") return allowNew;
        if (currentMode === "edit") return allowEdit;
        return allowCancel;
      },
      [allowNew, allowEdit, allowCancel],
    );

    useEffect(() => {
      if (!nextDefaultMode) {
        if (mode !== null) {
          setMode(null);
        }
        return;
      }
      if (!isModeAllowed(mode)) {
        setMode(nextDefaultMode);
      }
    }, [mode, nextDefaultMode, isModeAllowed]);

    // textarea 的 onChange（有 value）
    const onTextChange: NonNullable<FormControlProps["onChange"]> = useCallback(
      (event) => {
        setText(event.currentTarget.value);
      },
      [],
    );

    // 单选按钮（radio）的 onChange（用 value）
    const onModeChange: NonNullable<FormControlProps["onChange"]> = useCallback(
      (event) => {
        const value = event.currentTarget.value as HintModalMode;
        setMode((prev) => {
          if (value === prev) {
            return prev;
          }
          if (value === "new" && allowNew) return value;
          if (value === "edit" && allowEdit) return value;
          if (value === "cancel" && allowCancel) return value;
          return prev;
        });
      },
      [allowNew, allowEdit, allowCancel],
    );

    const disableForm = submitState === HintModalSubmitState.SUBMITTING;
    const modeIsAllowed = isModeAllowed(mode);
    const requiresText = mode === "new" || mode === "edit";
    const missingText = requiresText && text.trim().length === 0;
    const disableTextArea =
      disableForm ||
      puzzleSolved ||
      !mode ||
      !modeIsAllowed ||
      mode === "cancel";
    const submitDisabled =
      disableForm || puzzleSolved || !mode || !modeIsAllowed || missingText;

    const showSheetPermissionButton = Boolean(
      huntHasGoogleGroup && documentType?.provider === "google",
    );

    useEffect(() => {
      let cancelled = false;
      if (!showSheetPermissionButton) {
        setAnyoneReaderEnabled(null);
        setSheetPermissionPending(false);
        setSheetPermissionError(null);
        return () => {
          cancelled = true;
        };
      }

      setSheetPermissionPending(true);
      setSheetPermissionError(null);

      void getDocumentAnyoneReaderStatus
        .callPromise({ documentId: documentType!._id })
        .then((enabled) => {
          if (!cancelled) {
            setAnyoneReaderEnabled(Boolean(enabled));
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setSheetPermissionError(formatErrorMessage(error));
            setAnyoneReaderEnabled(false);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSheetPermissionPending(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [documentType, showSheetPermissionButton]);

    const handleToggleSheetPermission = useCallback(() => {
      const run = async () => {
        if (!showSheetPermissionButton || sheetPermissionPending) {
          return;
        }

        const targetState = !anyoneReaderEnabled;

        const confirmed = await confirm({
          title: targetState
            ? studioI18n.t("studio.messages.m25")
            : studioI18n.t("studio.messages.m26"),
          body: targetState ? (
            <div>
              <p>{studioI18n.t("studio.messages.m27")}</p>
              <p>{studioI18n.t("studio.messages.m28")}</p>
            </div>
          ) : (
            studioI18n.t("studio.messages.m29")
          ),
          actionLabel: targetState
            ? studioI18n.t("studio.messages.m30")
            : studioI18n.t("studio.messages.m31"),
          confirmVariant: targetState ? "primary" : "danger",
        });

        if (!confirmed) {
          return;
        }

        try {
          setSheetPermissionPending(true);
          setSheetPermissionError(null);
          await setDocumentAnyoneReaderStatus.callPromise({
            documentId: documentType!._id,
            enable: targetState,
          });
          setAnyoneReaderEnabled(targetState);
        } catch (error) {
          setSheetPermissionError(formatErrorMessage(error));
        } finally {
          setSheetPermissionPending(false);
        }
      };

      void run();
    }, [
      anyoneReaderEnabled,
      confirm,
      documentType,
      sheetPermissionPending,
      showSheetPermissionButton,
    ]);

    const sheetPermissionButtonLabel = anyoneReaderEnabled
      ? studioI18n.t("studio.messages.m26")
      : studioI18n.t("studio.messages.m25");

    let url = "";
    switch (documentType?.value.type) {
      case "spreadsheet":
        url = `https://docs.google.com/spreadsheets/d/${documentType.value.id}`;
        break;
      case "document":
        url = `https://docs.google.com/document/d/${documentType.value.id}`;
        break;
      default:
        url = "";
    }

    const handleInsertTemplate = useCallback(() => {
      if (disableTextArea) {
        return;
      }
      setText(Mustache.render(getHintTemplate(), { url }));
    }, [disableTextArea, url]);

    // 注意：这里的 callback 是 ModalForm 传进来的 () => void，我们不调用它以保持弹窗常驻
    const onFormSubmit = useCallback(
      (callback: (shouldClose?: boolean) => void) => {
        const handleSubmit = async () => {
          if (!mode || !isModeAllowed(mode)) {
            setErrorMessage(studioI18n.t("studio.messages.m32"));
            setSubmitState(HintModalSubmitState.FAILED);
            callback(false);
            return;
          }

          const trimmedText = text.trim();
          const needsText = mode === "new" || mode === "edit";
          if (!trimmedText && needsText) {
            setErrorMessage(studioI18n.t("studio.messages.m33"));
            setSubmitState(HintModalSubmitState.FAILED);
            callback(false);
            return;
          }

          if ((mode === "cancel" || mode === "edit") && !editableHintId) {
            setErrorMessage(
              studioI18n.t(
                mode === "cancel"
                  ? "studio.messages.m34"
                  : "studio.messages.m38",
              ),
            );
            setSubmitState(HintModalSubmitState.FAILED);
            callback(false);
            return;
          }
          let confirmed: boolean;
          if (mode === "cancel") {
            confirmed = await confirm({
              title: studioI18n.t("studio.messages.m35"),
              body: studioI18n.t("studio.messages.m36"),
              actionLabel: studioI18n.t("studio.messages.m37"),
              confirmVariant: "danger",
            });
          } else if (mode === "edit") {
            confirmed = await confirm({
              title: studioI18n.t("studio.messages.m39"),
              body: studioI18n.t("studio.messages.m40"),
              actionLabel: studioI18n.t("studio.messages.m41"),
              confirmVariant: "primary",
            });
          } else {
            confirmed = await confirm({
              title: studioI18n.t("studio.messages.m42"),
              body: studioI18n.t("studio.messages.m43"),
              actionLabel: studioI18n.t("studio.messages.m44"),
              confirmVariant: "primary",
            });
          }

          if (!confirmed) {
            callback(false);
            return;
          }
          setSubmitState(HintModalSubmitState.SUBMITTING);
          setErrorMessage("");

          const payload: HintModalFormSubmitPayload = {
            huntId,
            puzzleId,
            puzzleTitle,
            text: trimmedText,
            mode,
          };

          if (mode !== "new" && editableHintId) {
            payload.hintId = editableHintId;
          }

          onSubmit(payload, (error) => {
            if (error) {
              setSubmitState(HintModalSubmitState.FAILED);
              setErrorMessage(error.message);
              callback(false);
            } else {
              setSubmitState(HintModalSubmitState.IDLE);
              setErrorMessage("");
              if (mode === "new" || mode === "edit") {
                setSuccessMode(mode);
              } else {
                setSuccessMode(null);
              }
              if (mode === "new") {
                setText("");
              } else if (mode === "edit") {
                setText(trimmedText);
              }
              if (mode === "cancel") {
                setMode(nextDefaultMode);
              }
            }
            callback(false);
          });
        };

        void handleSubmit();
      },
      [
        confirm,
        editableHintId,
        huntId,
        isModeAllowed,
        mode,
        nextDefaultMode,
        onSubmit,
        puzzleId,
        puzzleTitle,
        text,
      ],
    );

    const alerts: React.ReactNode[] = [];

    if (!successMode) {
      if (puzzleSolved) {
        alerts.push(
          <Alert variant="warning" key="hint-solved">
            {studioI18n.t("studio.messages.m45")}
          </Alert>,
        );
      } else if (hintJustSent) {
        alerts.push(
          <Alert variant="warning" key="hint-sent">
            {studioI18n.t("studio.messages.m46")}
          </Alert>,
        );
      } else if (hasQueuedHint) {
        const queuedMessages: { id: string; content: React.ReactNode }[] = [];
        if (allowEdit) {
          queuedMessages.push({
            id: "queued-edit",
            content: studioI18n.t("studio.messages.m47"),
          });
        }
        if (allowCancel) {
          queuedMessages.push({
            id: "queued-cancel",
            content: studioI18n.t("studio.messages.m48"),
          });
        }
        if (queuedMessages.length === 0) {
          queuedMessages.push({
            id: "queued-wait",
            content: studioI18n.t("studio.messages.m49"),
          });
        }
        alerts.push(
          <Alert variant="warning" key="hint-pending">
            {studioI18n.t("studio.messages.m50")}
            <br />
            {queuedMessages.map((message, index) => (
              <React.Fragment key={message.id}>
                {index > 0 ? <br /> : null}
                {message.content}
              </React.Fragment>
            ))}
          </Alert>,
        );
      } else if (noHistory) {
        alerts.push(
          <Alert variant="info" key="hint-first">
            {studioI18n.t("studio.messages.m51")}
          </Alert>,
        );
      } else if (latestAnswered) {
        alerts.push(
          <Alert variant="info" key="hint-answered">
            {studioI18n.t("studio.messages.m52")}
          </Alert>,
        );
      }
    } else if (successMode === "new") {
      alerts.push(
        <Alert variant="info" key="hint-success-new">
          {studioI18n.t("studio.messages.m53")}
        </Alert>,
      );
    } else if (successMode === "edit") {
      alerts.push(
        <Alert variant="success" key="hint-success-edit">
          {studioI18n.t("studio.messages.m54")}
        </Alert>,
      );
    }

    const sortedHistory = useMemo(() => {
      return hintHistory.slice().toSorted((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      });
    }, [hintHistory]);

    const renderHistoryEntry = useCallback((hint: HintType) => {
      const timestamp = calendarTimeFormat(
        hint.statusChangedAt ?? hint.updatedAt ?? hint.createdAt,
        studioI18n.t,
        studioI18n.language,
      );
      return (
        <div key={hint._id} className="mb-3">
          <div className="d-flex justify-content-between flex-wrap">
            <span>
              <strong>
                {hint.kind === "followup"
                  ? studioI18n.t("studio.messages.m55")
                  : studioI18n.t("studio.messages.m56")}
              </strong>
              <span className="ms-2 badge bg-secondary">
                {statusLabel[hint.status]}
              </span>
            </span>
            <span className="text-muted" style={{ fontSize: "0.85rem" }}>
              {timestamp}
            </span>
          </div>
          <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}>
            {hint.text || <em>{studioI18n.t("studio.messages.m57")}</em>}
          </div>
          {hint.response ? (
            <div
              className="mt-2 p-2 bg-white border rounded"
              style={{ whiteSpace: "pre-wrap" }}
            >
              <strong>{studioI18n.t("studio.messages.m58")}</strong>
              <div>{hint.response}</div>
            </div>
          ) : null}
        </div>
      );
    }, []);

    const errorAlert =
      submitState === HintModalSubmitState.FAILED && errorMessage ? (
        <Alert variant="danger">{errorMessage}</Alert>
      ) : null;

    const modeStatusMessage = (() => {
      if (puzzleSolved) {
        return studioI18n.t("studio.messages.m59");
      }
      if (hintJustSent) {
        return studioI18n.t("studio.messages.m60");
      }
      if (hasQueuedHint) {
        if (allowEdit && allowCancel) {
          return studioI18n.t("studio.messages.m61");
        }
        if (allowEdit) {
          return studioI18n.t("studio.messages.m62");
        }
        if (allowCancel) {
          return studioI18n.t("studio.messages.m63");
        }
        return studioI18n.t("studio.messages.m64");
      }
      if (noHistory) {
        return allowNew
          ? studioI18n.t("studio.messages.m65")
          : studioI18n.t("studio.messages.m66");
      }
      if (latestAnswered) {
        return allowNew
          ? studioI18n.t("studio.messages.m67")
          : studioI18n.t("studio.messages.m68");
      }
      if (allowNew) {
        return studioI18n.t("studio.messages.m69");
      }
      return studioI18n.t("studio.messages.m70");
    })();

    useEffect(() => {
      if (successMode && (successMode === "new" || successMode === "edit")) {
        setSuccessMode(null);
      }
    }, [successMode, latestHintStatus, latestPendingHintId]);

    return (
      <>
        <ModalForm
          ref={formRef}
          size="xl"
          title={studioI18n.t("studio.templates.requestTitle", {
            p0: puzzleTitle,
          })}
          onSubmit={onFormSubmit}
          submitDisabled={submitDisabled}
          submitLabel={studioI18n.t("studio.messages.m44")}
        >
          {alerts}

          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} htmlFor="jr-hint-text">
              {studioI18n.t("studio.messages.m71")}
            </FormLabel>
            <Col xs={9}>
              <div className="d-flex justify-content-start mb-2 gap-2 flex-wrap">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={handleInsertTemplate}
                  disabled={disableTextArea}
                >
                  {studioI18n.t("studio.messages.m72")}
                </Button>
                <CopyToClipboardButton
                  variant="outline-secondary"
                  size="sm"
                  text={() => text}
                >
                  {studioI18n.t("studio.messages.m73")}
                </CopyToClipboardButton>
                {showSheetPermissionButton ? (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handleToggleSheetPermission}
                    disabled={sheetPermissionPending}
                  >
                    {sheetPermissionPending
                      ? studioI18n.t("studio.messages.m74")
                      : sheetPermissionButtonLabel}
                  </Button>
                ) : null}
              </div>
              {sheetPermissionError ? (
                <div className="text-danger small mb-2">
                  {sheetPermissionError}
                </div>
              ) : null}
              <FormControl
                id="jr-hint-text"
                as="textarea"
                rows={6}
                disabled={disableTextArea}
                value={text}
                onChange={onTextChange}
                placeholder={studioI18n.t("studio.templates.requestHelp", {
                  p0: showSheetPermissionButton
                    ? studioI18n.t("studio.messages.m75")
                    : "",
                })}
              />
            </Col>
          </FormGroup>

          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3} className="pt-0">
              {studioI18n.t("studio.messages.m76")}
            </FormLabel>
            <Col xs={9}>
              <div
                className="border rounded bg-light"
                style={{
                  maxHeight: "260px",
                  overflowY: "auto",
                  padding: "8px",
                }}
              >
                {sortedHistory.length === 0 ? (
                  <div className="text-muted">
                    {studioI18n.t("studio.messages.m77")}
                  </div>
                ) : (
                  sortedHistory.map((hint) => renderHistoryEntry(hint))
                )}
              </div>
            </Col>
          </FormGroup>

          <FormGroup as={Row} className="mb-3">
            <FormLabel column xs={3}>
              {studioI18n.t("studio.messages.m78")}
            </FormLabel>
            <Col xs={9}>
              {allowNew ? (
                <FormCheck
                  inline
                  type="radio"
                  id="jr-hint-mode-new"
                  name="jr-hint-mode"
                  label={studioI18n.t("studio.messages.m79")}
                  value="new"
                  disabled={disableForm}
                  checked={mode === "new"}
                  onChange={onModeChange}
                />
              ) : null}
              {allowEdit ? (
                <FormCheck
                  inline
                  type="radio"
                  id="jr-hint-mode-edit"
                  name="jr-hint-mode"
                  label={studioI18n.t("studio.messages.m80")}
                  value="edit"
                  disabled={disableForm}
                  checked={mode === "edit"}
                  onChange={onModeChange}
                />
              ) : null}
              {allowCancel ? (
                <FormCheck
                  inline
                  type="radio"
                  id="jr-hint-mode-cancel"
                  name="jr-hint-mode"
                  label={studioI18n.t("studio.messages.m35")}
                  value="cancel"
                  disabled={disableForm}
                  checked={mode === "cancel"}
                  onChange={onModeChange}
                />
              ) : null}
              <div className="mt-1 text-muted" style={{ fontSize: "0.85rem" }}>
                {modeStatusMessage}
              </div>
            </Col>
          </FormGroup>

          {errorAlert}
        </ModalForm>
        {ConfirmationDialog}
      </>
    );
  },
);

export default HintModalForm;
