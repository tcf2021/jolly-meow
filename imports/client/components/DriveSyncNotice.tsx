import Alert from "react-bootstrap/Alert";
import { useTranslation as useStudioTranslation } from "react-i18next";
import type { DriveSyncType } from "../../lib/models/DriveSync";
import studioI18n from "../i18n";

const DriveSyncNotice = ({ driveSync }: { driveSync?: DriveSyncType }) => {
  useStudioTranslation();

  if (!driveSync) return null;
  return (
    <Alert
      variant="warning"
      className="m-2 py-1"
      data-testid="drive-sync-status"
    >
      {driveSync.error ?? studioI18n.t("studio.messages.m8")}
    </Alert>
  );
};

export default DriveSyncNotice;
