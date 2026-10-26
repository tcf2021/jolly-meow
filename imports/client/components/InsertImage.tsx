import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { faImage } from "@fortawesome/free-solid-svg-icons/faImage";
import { faSpinner } from "@fortawesome/free-solid-svg-icons/faSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import type { ChangeEvent, MouseEvent, SubmitEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormSelect from "react-bootstrap/FormSelect";
import Modal from "react-bootstrap/Modal";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import createDocumentImageUpload from "../../methods/createDocumentImageUpload";
import type { ImageSource } from "../../methods/insertDocumentImage";
import insertDocumentImage from "../../methods/insertDocumentImage";
import type { Sheet } from "../../methods/listDocumentSheets";
import listDocumentSheets from "../../methods/listDocumentSheets";
import GoogleScriptInfo from "../GoogleScriptInfo";
import studioI18n from "../i18n";

type ImageInsertModalHandle = {
  show: () => void;
};

enum InsertImageSubmitState {
  IDLE,
  SUBMITTING,
  ERROR,
}

class InvalidImage extends Error {}

const googleImageErrorKey = (error: unknown) => {
  const code =
    error && typeof error === "object" && "error" in error
      ? error.error
      : undefined;
  switch (code) {
    case "google-script-timeout":
      return "imageInsert.timeout";
    case "google-script-sheet-missing":
      return "imageInsert.sheetMissing";
    case "google-script-response":
    case "google-script-rejected":
      return "imageInsert.authorization";
    case "google-script-unavailable":
    case "google-sheets-unavailable":
      return "imageInsert.unavailable";
    default:
      return "imageInsert.failed";
  }
};

export const validateImageForDirectUpload = async (
  file: File,
): Promise<string> => {
  if (file.size > 2 * 1024 * 1024) {
    throw new InvalidImage(studioI18n.t("imageInsert.tooLarge"));
  }

  const newFileContents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(reader.result as string);
    });
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
  const newImagePixels = await new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image.width * image.height);
    });
    image.addEventListener("error", () => {
      reject(new InvalidImage(studioI18n.t("imageInsert.invalidImage")));
    });
    image.src = newFileContents;
  });

  if (newImagePixels > 1000000) {
    throw new InvalidImage(studioI18n.t("imageInsert.tooManyPixels"));
  }

  return newFileContents;
};

const makeImageSource = async ({
  documentId,
  imageSource,
  file,
  imageUrl,
}: {
  documentId: string;
  imageSource: string;
  file?: File;
  imageUrl: string;
}): Promise<ImageSource> => {
  if (imageSource === "link") {
    return {
      source: "link",
      url: imageUrl,
    };
  }

  if (!file) {
    throw new Error("No file provided");
  }

  const upload = await createDocumentImageUpload.callPromise({
    documentId,
    filename: file.name,
    mimeType: file.type,
  });
  // If we don't get an upload spec back, then S3 isn't configured and we can
  // fall back to blob inserts
  if (!upload) {
    const validatedContents = await validateImageForDirectUpload(file);
    return {
      source: "upload",
      filename: file.name,
      contents: validatedContents,
    };
  }

  const { publicUrl, uploadUrl, fields } = upload;
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  formData.append("file", file);
  await fetch(uploadUrl, {
    method: "POST",
    mode: "no-cors",
    body: formData,
  });

  return {
    source: "link",
    url: publicUrl,
  };
};

const InsertImageModal = ({
  documentId,
  sheets,
  loading,
  listError,
  onRefresh,
  ref,
}: {
  documentId: string;
  sheets: Sheet[];
  loading: boolean;
  listError?: string;
  onRefresh: () => void;
  ref: React.Ref<ImageInsertModalHandle>;
}) => {
  const { t } = useTranslation();
  // Pop up by default when first rendered.
  const [visible, setVisible] = useState(true);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  useImperativeHandle(ref, () => ({ show }), [show]);

  const [submitState, setSubmitState] = useState<InsertImageSubmitState>(
    InsertImageSubmitState.IDLE,
  );
  const [submitError, setSubmitError] = useState<string>("");
  const [inserting, setInserting] = useState(false);
  const clearError = useCallback(
    () => setSubmitState(InsertImageSubmitState.IDLE),
    [],
  );

  const [sheet, setSheet] = useState<number | undefined>(sheets[0]?.id);
  const selectedSheet =
    sheet !== undefined && sheets.some((s) => s.id === sheet)
      ? sheet
      : sheets[0]?.id;
  const onChangeSheet = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setSheet(parseInt(e.target.value, 10));
  }, []);

  const sheetOptions = useMemo(() => {
    return sheets.map((s) => {
      return (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      );
    });
  }, [sheets]);

  const [imageSource, setImageSource] = useState<string>("upload");
  const onSelectTab = useCallback((k: string | null) => {
    if (k) {
      setImageSource(k);
    }
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [fileInvalid, setFileInvalid] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [pasteError, setPasteError] = useState(false);

  useEffect(() => {
    if (!file || !visible) {
      setPreviewUrl(undefined);
      return undefined;
    }
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file, visible]);

  const onChangeFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    setFile(newFile);
    setFileInvalid(false);
    setPasteError(false);
    e.target.setCustomValidity("");
  }, []);

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (
        !visible ||
        imageSource !== "upload" ||
        submitState === InsertImageSubmitState.SUBMITTING
      )
        return;
      const image = Array.from(event.clipboardData.items)
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image) return;
      event.preventDefault();
      if (!["image/png", "image/jpeg", "image/gif"].includes(image.type)) {
        setPasteError(true);
        return;
      }
      // Clipboard files use the same upload and validation path as chosen files.
      if (fileRef.current) {
        const selection = new DataTransfer();
        selection.items.add(image);
        fileRef.current.files = selection.files;
        fileRef.current.setCustomValidity("");
      }
      setFile(image);
      setFileInvalid(false);
      setPasteError(false);
      clearError();
    },
    [visible, imageSource, submitState, clearError],
  );

  const [url, setUrl] = useState<string>("");
  const onChangeUrl = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
  }, []);

  const onSubmit = useCallback(
    (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (loading || selectedSheet === undefined) return;

      void (async () => {
        setSubmitState(InsertImageSubmitState.SUBMITTING);
        setInserting(false);
        try {
          const image = await makeImageSource({
            documentId,
            imageSource,
            file,
            imageUrl: url,
          });

          setInserting(true);
          await insertDocumentImage.callPromise({
            documentId,
            sheetId: selectedSheet,
            image,
          });
          setSubmitState(InsertImageSubmitState.IDLE);
          hide();
        } catch (err) {
          if (err instanceof InvalidImage) {
            setFileInvalid(true);
            fileRef.current?.setCustomValidity(err.message);
            fileRef.current?.reportValidity();
            setSubmitState(InsertImageSubmitState.IDLE);
          } else {
            setSubmitState(InsertImageSubmitState.ERROR);
            setSubmitError(googleImageErrorKey(err));
          }
        }
      })();
    },
    [documentId, imageSource, file, url, selectedSheet, loading, hide],
  );

  const submitDisabled = submitState === InsertImageSubmitState.SUBMITTING;

  const idPrefix = useId();

  const modal = (
    <Modal
      show={visible}
      onHide={hide}
      onPaste={onPaste}
      data-testid="image-insert-modal"
    >
      <Modal.Header closeButton>
        {t("puzzle.insertImage.insertImage", "Insert image")}
      </Modal.Header>
      <Form onSubmit={onSubmit}>
        <Modal.Body>
          <FormGroup className="mb-3" controlId={`${idPrefix}-sheet-select`}>
            <div className="d-flex align-items-center justify-content-between mb-1">
              <FormLabel className="mb-0">
                {t("puzzle.insertImage.chooseSheet", "Choose a sheet")}
              </FormLabel>
              <Button
                size="sm"
                variant="link"
                disabled={loading || submitDisabled}
                onClick={onRefresh}
                data-testid="image-sheet-refresh"
              >
                {t("imageInsert.refresh")}
              </Button>
            </div>
            <FormSelect
              id={`${idPrefix}-sheet-select`}
              onChange={onChangeSheet}
              value={selectedSheet ?? ""}
              disabled={loading || submitDisabled || sheets.length === 0}
              data-testid="image-sheet-select"
            >
              {sheets.length === 0 && (
                <option value="">
                  {t(loading ? "imageInsert.loading" : "imageInsert.empty")}
                </option>
              )}
              {sheetOptions}
            </FormSelect>
            {loading && (
              <div className="small text-muted mt-2" role="status">
                <FontAwesomeIcon icon={faSpinner} spin />{" "}
                {t("imageInsert.loadingHelp")}
              </div>
            )}
            {listError && (
              <Alert variant="danger" className="mt-2 mb-0">
                {t(listError)}{" "}
                <Button variant="link" size="sm" onClick={onRefresh}>
                  {t("imageInsert.retry")}
                </Button>
              </Alert>
            )}
          </FormGroup>
          <Tabs activeKey={imageSource} onSelect={onSelectTab} className="mb-3">
            <Tab
              eventKey="upload"
              title={t("puzzle.insertImage.Upload", "Upload")}
            >
              <FormControl
                type="file"
                onChange={onChangeFile}
                isInvalid={fileInvalid}
                required={imageSource === "upload" && !file}
                ref={fileRef}
                accept=".png,.jpg,.jpeg,.gif"
                disabled={submitDisabled}
                data-testid="image-insert-file"
              />
              <div className="small text-muted mt-2">
                {t("imageInsert.pasteHelp")}
              </div>
              {pasteError && (
                <Alert variant="danger" className="mt-2 mb-0">
                  {t("imageInsert.pasteFormat")}
                </Alert>
              )}
              {file && (
                <div className="mt-2" data-testid="image-insert-preview">
                  <div className="small text-break">
                    {t("imageInsert.selectedFile", { name: file.name })}
                  </div>
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={t("imageInsert.preview")}
                      className="d-block border rounded mt-2"
                      style={{ maxWidth: "100%", maxHeight: 160 }}
                    />
                  )}
                </div>
              )}
            </Tab>
            <Tab eventKey="link" title={t("puzzle.insertImage.link", "Link")}>
              <FormGroup className="mb-3" controlId={`${idPrefix}-image-link`}>
                <FormLabel>
                  {t("puzzle.insertImage.imageUrl", "Image URL")}
                </FormLabel>
                <FormControl
                  type="url"
                  required={imageSource === "link"}
                  onChange={onChangeUrl}
                  value={url}
                />
              </FormGroup>
            </Tab>
          </Tabs>
        </Modal.Body>
        <Modal.Footer>
          <div className="mb-3">
            <Button
              variant="primary"
              type="submit"
              disabled={
                submitDisabled || loading || selectedSheet === undefined
              }
              data-testid="image-insert-submit"
            >
              {submitDisabled ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />{" "}
                  {t(
                    inserting
                      ? "imageInsert.inserting"
                      : "imageInsert.uploading",
                  )}
                </>
              ) : (
                t("puzzle.insertImage.insert", "Insert")
              )}
            </Button>
          </div>
          {submitState === InsertImageSubmitState.ERROR ? (
            <Alert variant="danger" dismissible onClose={clearError}>
              {t(submitError)}
              <div className="mt-1">{t("imageInsert.checkBeforeRetry")}</div>
            </Alert>
          ) : null}
        </Modal.Footer>
      </Form>
    </Modal>
  );

  return createPortal(modal, document.body);
};

const InsertImage = ({ documentId }: { documentId: string }) => {
  useSubscribe("googleScriptInfo");
  const insertEnabled = useTracker(
    () => !!GoogleScriptInfo.findOne("googleScriptInfo")?.configured,
    [],
  );
  const [loading, setLoading] = useState(false);
  const [documentSheets, setDocumentSheets] = useState<Sheet[]>([]);
  const [renderInsertModal, setRenderInsertModal] = useState(false);
  const insertModalRef = useRef<ImageInsertModalHandle>(null);
  const [listSheetsError, setListSheetsError] = useState<string>();
  const requestPending = useRef(false);
  const sheetsLoadedAt = useRef(0);

  const { t } = useTranslation();

  const loadSheets = useCallback(
    (refresh = false) => {
      if (requestPending.current) return;
      if (!refresh && Date.now() - sheetsLoadedAt.current < 60_000) return;
      requestPending.current = true;
      setLoading(true);
      setListSheetsError(undefined);
      listDocumentSheets.call({ documentId, refresh }, (err, sheets) => {
        requestPending.current = false;
        setLoading(false);
        if (err) {
          setListSheetsError(googleImageErrorKey(err));
        } else if (sheets) {
          setDocumentSheets(sheets);
          sheetsLoadedAt.current = Date.now();
          if (sheets.length === 0) setListSheetsError("imageInsert.empty");
        }
      });
    },
    [documentId],
  );

  useEffect(() => {
    if (insertEnabled) loadSheets();
  }, [insertEnabled, loadSheets]);

  const onStartInsert = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      if (insertModalRef.current) insertModalRef.current.show();
      else setRenderInsertModal(true);
      loadSheets();
    },
    [loadSheets],
  );

  if (!insertEnabled) return null;

  return (
    <>
      {renderInsertModal && (
        <InsertImageModal
          key={documentId}
          ref={insertModalRef}
          documentId={documentId}
          sheets={documentSheets}
          loading={loading}
          listError={listSheetsError}
          onRefresh={() => loadSheets(true)}
        />
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={onStartInsert}
        data-testid="insert-image"
      >
        <FontAwesomeIcon icon={faImage} />{" "}
        {t("puzzle.insertImage.insertImage", "Insert image")}
      </Button>
    </>
  );
};

export default InsertImage;
