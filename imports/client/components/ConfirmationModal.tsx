import React, { useCallback, useMemo, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import type { ButtonProps } from "react-bootstrap/Button";
import Button from "react-bootstrap/Button";
import type { ModalProps } from "react-bootstrap/Modal";
import Modal from "react-bootstrap/Modal";
import { createPortal } from "react-dom";
import { useTranslation as useStudioTranslation } from "react-i18next";
import studioI18n from "../i18n";

export type ConfirmationModalProps = {
  show: boolean;
  title: string;
  body: React.ReactNode;
  actionLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  size?: ModalProps["size"];
  centered?: boolean;
  submitting?: boolean;
  actionInProgressLabel?: string;
  errorMessage?: string;
  onDismissError?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  show,
  title,
  body,
  actionLabel,
  cancelLabel = studioI18n.t("studio.messages.m1"),
  confirmVariant = "danger",
  size,
  centered = false,
  submitting = false,
  actionInProgressLabel,
  errorMessage,
  onDismissError,
  onConfirm,
  onCancel,
}) => {
  useStudioTranslation();

  const handleCancel = () => {
    if (submitting) {
      return;
    }
    onCancel();
  };

  const modalActionLabel =
    submitting && actionInProgressLabel ? actionInProgressLabel : actionLabel;

  const modal = (
    <Modal
      show={show}
      onHide={handleCancel}
      size={size}
      centered={centered}
      keyboard={!submitting}
      backdrop={submitting ? "static" : true}
    >
      <Modal.Header closeButton={!submitting}>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {body}
        {errorMessage && (
          <Alert
            variant="danger"
            className="mt-3 mb-0"
            dismissible={Boolean(onDismissError)}
            onClose={onDismissError}
          >
            {errorMessage}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={submitting}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={submitting}
        >
          {modalActionLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(modal, document.body);
};

export type ConfirmationDialogOptions = {
  title: string;
  body: React.ReactNode;
  actionLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  size?: ModalProps["size"];
  centered?: boolean;
};

export const useConfirmationDialog = () => {
  const [options, setOptions] = useState<ConfirmationDialogOptions | null>(
    null,
  );
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const resolveWith = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback((opts: ConfirmationDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const handleCancel = useCallback(() => {
    resolveWith(false);
    setOptions(null);
  }, [resolveWith]);

  const handleConfirm = useCallback(() => {
    resolveWith(true);
    setOptions(null);
  }, [resolveWith]);

  const dialog = useMemo(() => {
    if (!options) {
      return null;
    }
    return (
      <ConfirmationModal
        show
        title={options.title}
        body={options.body}
        actionLabel={options.actionLabel}
        cancelLabel={options.cancelLabel}
        confirmVariant={options.confirmVariant}
        size={options.size}
        centered={options.centered}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }, [options, handleConfirm, handleCancel]);

  return { confirm, ConfirmationDialog: dialog } as const;
};

export default ConfirmationModal;
