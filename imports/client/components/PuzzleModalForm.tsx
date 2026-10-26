import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Col from "react-bootstrap/Col";
import FormCheck from "react-bootstrap/FormCheck";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import Row from "react-bootstrap/Row";
import { useTranslation } from "react-i18next";
import type { ActionMeta } from "react-select";
import { useTheme } from "styled-components";
import Documents from "../../lib/models/Documents";
import type { PuzzleType } from "../../lib/models/Puzzles";
import type { TagType } from "../../lib/models/Tags";
import {
  optionalWorkspaceUrl,
  type PuzzleDocumentType,
  puzzleHasWhiteboard,
} from "../../lib/PuzzleDocumentTypes";
import LabelledRadioGroup from "./LabelledRadioGroup";
import Loading from "./Loading";
import type { ModalFormHandle } from "./ModalForm";
import ModalForm from "./ModalForm";

// Casting away the React.lazy because otherwise we lose access to the generic parameter
const Creatable = React.lazy(
  () => import("react-select/creatable"),
) as typeof import("react-select/creatable").default;

type TagSelectOption = { value: string; label: string };

export interface PuzzleModalFormSubmitPayload {
  huntId: string;
  title: string;
  url: string | undefined;
  tags: string[];
  docType?: PuzzleDocumentType;
  hasWhiteboard?: boolean;
  confirmWorkspaceDeletion?: boolean;
  documentUrl?: string;
  expectedAnswerCount: number;
  allowDuplicateUrls?: boolean;
  completedWithNoAnswer?: boolean;
}

enum PuzzleModalFormSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  FAILED = "failed",
}

export type PuzzleModalFormHandle = {
  reset: () => void;
  show: () => void;
};

const PuzzleModalForm = ({
  huntId,
  puzzle,
  tags: propsTags,
  onSubmit,
  showOnMount,
  puzzleUrl,
  puzzleTitle,
  ref,
}: {
  huntId: string;
  puzzle?: PuzzleType;
  // All known tags for this hunt
  tags: TagType[];
  onSubmit: (
    payload: PuzzleModalFormSubmitPayload,
    callback: (error?: Error) => void,
  ) => void;
  showOnMount?: boolean;
  puzzleUrl?: string;
  puzzleTitle?: string;
  ref: React.Ref<PuzzleModalFormHandle>;
}) => {
  const tagNamesForIds = useCallback(
    (tagIds: string[]) => {
      const tagNames: Record<string, string> = {};
      propsTags.forEach((t) => {
        tagNames[t._id] = t.name;
      });
      return tagIds.map((t) => tagNames[t] ?? t);
    },
    [propsTags],
  );

  const [title, setTitle] = useState<string>(
    puzzle?.title ?? puzzleTitle ?? "",
  );
  const [url, setUrl] = useState<string>(puzzle?.url ?? puzzleUrl ?? "");
  const [tags, setTags] = useState<string[]>(
    puzzle ? tagNamesForIds(puzzle.tags) : [],
  );
  const existingDocument = useTracker(
    () => (puzzle ? Documents.findOne({ puzzle: puzzle._id }) : undefined),
    [puzzle],
  );
  const initialDocType =
    puzzle?.docType ?? existingDocument?.value.type ?? "spreadsheet";
  const [docType, setDocType] = useState<PuzzleDocumentType>(
    initialDocType === "excalidraw" ? "none" : initialDocType,
  );
  const [hasWhiteboard, setHasWhiteboard] = useState(
    puzzle ? puzzleHasWhiteboard(puzzle) : false,
  );
  const [confirmWorkspaceDeletion, setConfirmWorkspaceDeletion] =
    useState(false);
  const clearingWhiteboard =
    !!puzzle && puzzleHasWhiteboard(puzzle) && !hasWhiteboard;
  const closingGoogle =
    !!puzzle &&
    docType === "none" &&
    (initialDocType === "spreadsheet" ||
      initialDocType === "document" ||
      existingDocument?.provider === "google");
  const requiresCleanupConfirmation = clearingWhiteboard || closingGoogle;
  const [documentUrl, setDocumentUrl] = useState(puzzle?.documentUrl ?? "");
  const [expectedAnswerCount, setExpectedAnswerCount] = useState<number>(
    puzzle ? puzzle.expectedAnswerCount : 1,
  );
  const [considerCompletedWithNoAnswer, setConsiderCompletedWithNoAnswer] =
    useState<boolean | undefined>(puzzle?.completedWithNoAnswer);
  const [confirmingDuplicateUrl, setConfirmingDuplicateUrl] =
    useState<boolean>(false);
  const [allowDuplicateUrls, setAllowDuplicateUrls] = useState<
    boolean | undefined
  >(puzzle ? undefined : false);
  const [submitState, setSubmitState] = useState<PuzzleModalFormSubmitState>(
    PuzzleModalFormSubmitState.IDLE,
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [titleDirty, setTitleDirty] = useState<boolean>(false);
  const [urlDirty, setUrlDirty] = useState<boolean>(false);
  const [tagsDirty, setTagsDirty] = useState<boolean>(false);
  const [expectedAnswerCountDirty, setExpectedAnswerCountDirty] =
    useState<boolean>(false);
  const [
    considerCompletedWithNoAnswerDirty,
    setConsiderCompletedWithNoAnswerDirty,
  ] = useState<boolean>(false);

  const formRef = useRef<ModalFormHandle>(null);

  const onTitleChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (event) => {
      setTitle(event.currentTarget.value);
      setTitleDirty(true);
    },
    [],
  );

  const onUrlChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (event) => {
      setUrl(event.currentTarget.value);
      setUrlDirty(true);
    },
    [],
  );

  const onTagsChange = useCallback(
    (
      value: readonly TagSelectOption[],
      action: ActionMeta<TagSelectOption>,
    ) => {
      let newTags = [];
      switch (action.action) {
        case "clear":
        case "create-option":
        case "deselect-option":
        case "pop-value":
        case "remove-value":
        case "select-option":
          newTags = value.map((v) => v.value);
          break;
        default:
          return;
      }

      setTags(newTags);
      setTagsDirty(true);
    },
    [],
  );

  const onDocTypeChange = useCallback((newValue: string) => {
    setDocType(newValue as PuzzleDocumentType);
    setConfirmWorkspaceDeletion(false);
  }, []);

  const onExpectedAnswerCountChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((event) => {
      const string = event.currentTarget.value;
      const value = Number(string);
      setExpectedAnswerCount(value);
      setExpectedAnswerCountDirty(true);
      if (value === 0) {
        setConsiderCompletedWithNoAnswer(false);
      } else {
        setConsiderCompletedWithNoAnswer(undefined);
      }
      setConsiderCompletedWithNoAnswerDirty(true);
    }, []);

  const onAllowDuplicateUrlsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAllowDuplicateUrls(event.currentTarget.checked);
    },
    [],
  );

  const onConsiderSolvedWithNoAnswerChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setConsiderCompletedWithNoAnswer(event.currentTarget.checked);
      setConsiderCompletedWithNoAnswerDirty(true);
    },
    [],
  );

  const { t } = useTranslation();

  const onFormSubmit = useCallback(
    (callback: (shouldClose?: boolean) => void) => {
      if (requiresCleanupConfirmation && !confirmWorkspaceDeletion) {
        setSubmitState(PuzzleModalFormSubmitState.FAILED);
        setErrorMessage(t("workspaceCleanup.confirmationRequired"));
        callback(false);
        return;
      }
      setSubmitState(PuzzleModalFormSubmitState.SUBMITTING);
      const payload: PuzzleModalFormSubmitPayload = {
        huntId,
        title,
        url: url !== "" ? url : undefined, // Make sure we send undefined if url is falsy
        tags,
        expectedAnswerCount,
        completedWithNoAnswer: considerCompletedWithNoAnswer,
        hasWhiteboard,
        ...(requiresCleanupConfirmation
          ? { confirmWorkspaceDeletion: true }
          : {}),
        documentUrl:
          docType === "spreadsheet" || docType === "document"
            ? optionalWorkspaceUrl(documentUrl)
            : undefined,
      };
      if (docType) {
        payload.docType = docType;
      }
      if (allowDuplicateUrls) {
        payload.allowDuplicateUrls = allowDuplicateUrls;
      }
      onSubmit(payload, (error) => {
        if (error) {
          if (
            !puzzle &&
            error instanceof Meteor.Error &&
            typeof error.error === "number" &&
            error.error === 409
          ) {
            setErrorMessage(
              t(
                "puzzle.edit.duplicateUrlWarning",
                `A puzzle already exists with this URL - did someone else
                    already add this puzzle? To force creation anyway, check
                  the "Allow puzzles with identical URLs" box above and try
                  again.`,
              ),
            );
            setConfirmingDuplicateUrl(true);
          } else {
            setErrorMessage(error.message);
          }
          setSubmitState(PuzzleModalFormSubmitState.FAILED);
        } else {
          setSubmitState(PuzzleModalFormSubmitState.IDLE);
          setErrorMessage("");
          setConfirmWorkspaceDeletion(false);
          setTitleDirty(false);
          setUrlDirty(false);
          setTagsDirty(false);
          setExpectedAnswerCountDirty(false);
          setConsiderCompletedWithNoAnswerDirty(false);
          setConfirmingDuplicateUrl(false);
          setAllowDuplicateUrls(false);
          callback();
        }
      });
    },
    [
      onSubmit,
      huntId,
      title,
      url,
      tags,
      expectedAnswerCount,
      docType,
      allowDuplicateUrls,
      considerCompletedWithNoAnswer,
      hasWhiteboard,
      documentUrl,
      requiresCleanupConfirmation,
      confirmWorkspaceDeletion,
      puzzle,
      t,
    ],
  );

  const show = useCallback(() => {
    setConfirmWorkspaceDeletion(false);
    if (puzzle) {
      setDocType(initialDocType === "excalidraw" ? "none" : initialDocType);
      setHasWhiteboard(puzzleHasWhiteboard(puzzle));
      setDocumentUrl(puzzle.documentUrl ?? "");
    }
    if (formRef.current) {
      formRef.current.show();
    }
  }, [puzzle, initialDocType]);

  const reset = useCallback(() => {
    setTitle("");
    setUrl("");
    setTags([]);
    setExpectedAnswerCount(1);
    setDocType("spreadsheet");
    setHasWhiteboard(false);
    setConfirmWorkspaceDeletion(false);
    setDocumentUrl("");
  }, []);

  const currentTitle = useMemo(() => {
    if (!titleDirty && puzzle) {
      return puzzle.title;
    } else {
      return title;
    }
  }, [titleDirty, puzzle, title]);

  const currentUrl = useMemo(() => {
    if (!urlDirty && puzzle) {
      // Always make this a string so that currentUrl is not undefined, which
      // makes React confused about whether the input is controller or not.
      // If the string is empty, we'll turn it back into undefined in onFormSubmit.
      return puzzle.url ?? "";
    } else {
      return url;
    }
  }, [urlDirty, puzzle, url]);

  const currentTags = useMemo(() => {
    if (!tagsDirty && puzzle) {
      return tagNamesForIds(puzzle.tags);
    } else {
      return tags;
    }
  }, [tagsDirty, puzzle, tagNamesForIds, tags]);

  const currentExpectedAnswerCount = useMemo(() => {
    if (!expectedAnswerCountDirty && puzzle) {
      return puzzle.expectedAnswerCount;
    } else {
      return expectedAnswerCount;
    }
  }, [expectedAnswerCountDirty, puzzle, expectedAnswerCount]);

  const currentConsiderCompletedWithNoAnswer = useMemo(() => {
    if (!considerCompletedWithNoAnswerDirty && puzzle) {
      return puzzle.completedWithNoAnswer ?? false;
    } else {
      return considerCompletedWithNoAnswer ?? false;
    }
  }, [
    considerCompletedWithNoAnswerDirty,
    puzzle,
    considerCompletedWithNoAnswer,
  ]);

  useImperativeHandle(ref, () => ({
    show,
    reset,
  }));

  useEffect(() => {
    if (showOnMount) {
      show();
    }
  }, [showOnMount, show]);

  const disableForm = submitState === PuzzleModalFormSubmitState.SUBMITTING;

  const selectOptions: TagSelectOption[] = [
    ...propsTags.map((t) => t.name),
    ...tags,
  ]
    .filter(Boolean)
    .map((t) => {
      return { value: t, label: t };
    });

  const idPrefix = useId();

  const docTypeSelector = docType ? (
    <FormGroup as={Row} className="mb-3">
      <FormLabel column xs={3}>
        {t("puzzle.edit.documentType", "Document type")}
      </FormLabel>
      <Col xs={9}>
        <LabelledRadioGroup
          header=""
          options={[
            {
              value: "spreadsheet",
              label: t("studio.workspace.sheet", "Google Sheet"),
            },
            {
              value: "document",
              label: t("studio.workspace.doc", "Google Doc"),
            },
            {
              value: "none",
              label: t("studio.workspace.none", "No Google Sheet / Doc"),
            },
          ]}
          key={`${puzzle?._id ?? "new"}-${docType}`}
          initialValue={docType}
          help={t(
            "studio.workspace.help",
            "Use a whiteboard with a Google Sheet or Google Doc, and switch between them above the workspace.",
          )}
          onChange={onDocTypeChange}
        />
      </Col>
    </FormGroup>
  ) : null;

  const allowDuplicateUrlsCheckbox =
    !puzzle && allowDuplicateUrls !== undefined && confirmingDuplicateUrl ? (
      <FormCheck
        id={`${idPrefix}-allow-duplicate-urls`}
        label={t(
          "puzzle.edit.allowDuplicateUrls",
          "Allow puzzles with identical URLs",
        )}
        type="checkbox"
        disabled={disableForm}
        onChange={onAllowDuplicateUrlsChange}
        className="mt-1"
      />
    ) : null;

  const theme = useTheme();

  return (
    <Suspense
      fallback={
        <div>
          <Loading />
        </div>
      }
    >
      <ModalForm
        ref={formRef}
        title={
          puzzle
            ? t("puzzle.edit.editPuzzle", "Edit puzzle")
            : t("puzzle.edit.addPuzzle", "Add puzzle")
        }
        onSubmit={onFormSubmit}
        submitDisabled={
          disableForm ||
          (requiresCleanupConfirmation && !confirmWorkspaceDeletion)
        }
        closeDisabled={disableForm}
      >
        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-title`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.title", "Title")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              autoFocus
              disabled={disableForm}
              onChange={onTitleChange}
              value={currentTitle}
            />
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-url`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.url", "URL")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="text"
              disabled={disableForm}
              onChange={onUrlChange}
              value={currentUrl}
            />
            {allowDuplicateUrlsCheckbox}
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-tags`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.tags", "Tags")}
          </FormLabel>
          <Col xs={9}>
            <Creatable
              id={`${idPrefix}-new-puzzle-tags`}
              theme={theme.reactSelectTheme}
              options={selectOptions}
              isMulti
              isDisabled={disableForm}
              onChange={onTagsChange}
              value={currentTags.map((t) => {
                return { label: t, value: t };
              })}
            />
          </Col>
        </FormGroup>

        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-whiteboard`}
        >
          <FormLabel column xs={3}>
            {t("studio.workspace.whiteboard", "Whiteboard")}
          </FormLabel>
          <Col xs={9}>
            <FormCheck
              label={t(
                "studio.workspace.enable",
                "Enable collaborative Excalidraw whiteboard",
              )}
              checked={hasWhiteboard}
              disabled={disableForm}
              onChange={(e) => {
                setHasWhiteboard(e.currentTarget.checked);
                setConfirmWorkspaceDeletion(false);
              }}
            />
          </Col>
        </FormGroup>
        {docTypeSelector}
        {(docType === "spreadsheet" || docType === "document") && (
          <FormGroup
            as={Row}
            className="mb-3"
            controlId={`${idPrefix}-document-url`}
          >
            <FormLabel column xs={3}>
              {t("studio.workspace.url", "Document URL")}
            </FormLabel>
            <Col xs={9}>
              <FormControl
                type="url"
                value={documentUrl}
                disabled={disableForm}
                onChange={(e) => setDocumentUrl(e.currentTarget.value)}
                placeholder="https://docs.google.com/..."
              />
              <div className="form-text">
                {t(
                  "studio.workspace.urlHelp",
                  "Link an existing document, or leave blank to create one using the configured Google Drive account. The owner controls access to linked documents.",
                )}
              </div>
            </Col>
          </FormGroup>
        )}

        {requiresCleanupConfirmation && (
          <Alert variant="warning">
            {clearingWhiteboard && (
              <p>{t("workspaceCleanup.whiteboardWarning")}</p>
            )}
            {closingGoogle && <p>{t("workspaceCleanup.googleWarning")}</p>}
            <FormCheck
              id={`${idPrefix}-confirm-workspace-deletion`}
              label={t("workspaceCleanup.confirm")}
              checked={confirmWorkspaceDeletion}
              disabled={disableForm}
              onChange={(e) =>
                setConfirmWorkspaceDeletion(e.currentTarget.checked)
              }
            />
          </Alert>
        )}
        <FormGroup
          as={Row}
          className="mb-3"
          controlId={`${idPrefix}-new-puzzle-expected-answer-count`}
        >
          <FormLabel column xs={3}>
            {t("puzzle.edit.answerCount", "Expected # of answers")}
          </FormLabel>
          <Col xs={9}>
            <FormControl
              type="number"
              disabled={disableForm}
              onChange={onExpectedAnswerCountChange}
              value={currentExpectedAnswerCount}
              min={0}
              step={1}
            />
          </Col>
        </FormGroup>

        {currentExpectedAnswerCount === 0 ? (
          <FormCheck
            id={`${idPrefix}-solved-with-no-answers`}
            label={t(
              "puzzle.edit.considerSolvedWithNoAnswer",
              "Consider solved with no answers",
            )}
            type="checkbox"
            checked={currentConsiderCompletedWithNoAnswer}
            disabled={disableForm}
            onChange={onConsiderSolvedWithNoAnswerChange}
            className="mt-1"
          />
        ) : undefined}

        {submitState === PuzzleModalFormSubmitState.FAILED && (
          <Alert variant="danger">{errorMessage}</Alert>
        )}
      </ModalForm>
    </Suspense>
  );
};

export default PuzzleModalForm;
