import { useCallback, useId, useState } from "react";
import Alert from "react-bootstrap/Alert";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import { Trans, useTranslation } from "react-i18next";
import type { HuntType } from "../../lib/models/Hunts";
import purgeHunt from "../../methods/purgeHunt";
import ModalForm, { type ModalFormHandle } from "./ModalForm";

const HuntPurgeModal = ({
  ref,
  hunt,
}: {
  ref: React.RefObject<ModalFormHandle | null>;
  hunt: HuntType;
}) => {
  const [confirmText, setConfirmText] = useState<string>("");
  const [error, setError] = useState<Error>();
  const [pending, setPending] = useState(false);
  const idPrefix = useId();
  const { t } = useTranslation();

  const onConfirmTextChanged = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setConfirmText(e.target.value);
      setError(undefined);
    },
    [],
  );

  const onPurge = useCallback(
    (callback: (shouldClose?: boolean) => void) => {
      setError(undefined);
      setPending(true);
      purgeHunt.call({ huntId: hunt._id }, (error) => {
        setPending(false);
        setError(error);
        callback(!error);
      });
    },
    [hunt._id],
  );

  return (
    <ModalForm
      ref={ref}
      title={t("huntList.delete.confirm.title", "Delete hunt")}
      submitLabel={t("huntList.delete.confirm.submit", "Delete")}
      submitStyle="danger"
      onSubmit={onPurge}
      closeDisabled={pending}
      submitDisabled={pending || confirmText !== hunt.name}
    >
      <div>
        {error && <Alert variant="danger">{error.message}</Alert>}
        {t(
          "huntList.purge.confirm.text",
          'Are you sure you want to purge all content from "{{huntName}}"? Puzzle records and uploaded S3 images will be deleted. Google Drive folders and documents will be kept.',
          { huntName: hunt.name },
        )}
        <Alert variant="danger">
          {t("huntList.purge.confirm.warning", "This action cannot be undone.")}
        </Alert>
        <FormGroup controlId={`${idPrefix}-confirm`}>
          <FormLabel>
            <Trans
              i18nKey="huntList.purge.confirm.instructions"
              t={t}
              defaults="Type <code>{{huntName}}</code> below to confirm"
              components={{
                code: <code />,
              }}
              values={{ huntName: hunt.name }}
            />
          </FormLabel>
          <FormControl
            type="text"
            value={confirmText}
            onChange={onConfirmTextChanged}
            placeholder={hunt.name}
          />
        </FormGroup>
      </div>
    </ModalForm>
  );
};

export default HuntPurgeModal;
