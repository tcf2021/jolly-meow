import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useTranslation as useStudioTranslation } from "react-i18next";
import { useLocalStorage } from "usehooks-ts";
import HuntFolders from "../../lib/models/HuntFolders";
import huntWorkspace from "../../lib/publications/huntWorkspace";
import refreshHuntDocumentIndex from "../../methods/refreshHuntDocumentIndex";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import studioI18n from "../i18n";

const HuntWorkspaceLinks = ({
  huntId,
  canUpdate,
}: {
  huntId: string;
  canUpdate: boolean;
}) => {
  const { t } = useStudioTranslation();

  useTypedSubscribe(huntWorkspace, { huntId });
  const folder = useTracker(() => HuntFolders.findOne(huntId), [huntId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const userId = useTracker(() => Meteor.userId(), []);
  const [dismissedWarnings, setDismissedWarnings] = useLocalStorage<
    Record<string, string[]>
  >("huntWorkspaceDismissedWarnings", {});
  const dismissalScope = `${userId ?? "anonymous"}:${huntId}`;
  const warningKey =
    error ??
    folder?.indexError ??
    folder?.memberAccessErrorCode ??
    folder?.memberAccessError;
  const warning =
    error ??
    folder?.indexError ??
    (folder?.memberAccessErrorCode
      ? t(`huntWorkspace.access.${folder.memberAccessErrorCode}`)
      : folder?.memberAccessError);
  const refreshLabel = folder?.indexSpreadsheet
    ? studioI18n.t("studio.messages.m112")
    : studioI18n.t("studio.messages.m113");
  if (!folder && !canUpdate) return null;
  return (
    <div className="mb-3" data-testid="hunt-workspace-links">
      <div className="d-flex align-items-center flex-wrap gap-2">
        {folder && (
          <a
            className="btn btn-sm btn-outline-primary"
            href={`https://drive.google.com/drive/folders/${encodeURIComponent(folder.folder)}`}
            target="_blank"
            rel="noreferrer"
          >
            {studioI18n.t("studio.messages.m114")}
          </a>
        )}
        {folder?.indexSpreadsheet && (
          <a
            className="btn btn-sm btn-outline-primary"
            href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(folder.indexSpreadsheet)}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            {studioI18n.t("studio.messages.m115")}
          </a>
        )}
        {canUpdate && (
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              refreshHuntDocumentIndex.call({ huntId }, (err) => {
                setBusy(false);
                if (err) setError(err.reason ?? err.message);
              });
            }}
            data-testid="refresh-hunt-index"
          >
            {busy ? studioI18n.t("studio.messages.m116") : refreshLabel}
          </Button>
        )}
        {folder?.indexUpdatedAt && (
          <small className="text-muted">
            {studioI18n.t("studio.messages.m117")}
            {folder.indexUpdatedAt.toLocaleString()}
          </small>
        )}
      </div>
      {folder?.indexSpreadsheet && (
        <small className="text-muted">
          {studioI18n.t("studio.messages.m118")}
        </small>
      )}
      {warning &&
        warningKey &&
        !dismissedWarnings[dismissalScope]?.includes(warningKey) && (
          <Alert
            variant="warning"
            className="mt-2 mb-0"
            dismissible
            closeLabel={t("common.close")}
            data-testid="hunt-workspace-warning"
            onClose={() =>
              setDismissedWarnings((previous) => ({
                ...previous,
                [dismissalScope]: [
                  ...(previous[dismissalScope] ?? []),
                  warningKey,
                ],
              }))
            }
          >
            {warning}
          </Alert>
        )}
    </div>
  );
};

export default HuntWorkspaceLinks;
