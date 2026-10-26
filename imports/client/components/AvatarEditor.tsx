import type { Meteor } from "meteor/meteor";
import { useId, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { MAX_AVATAR_DATA_LENGTH } from "../../lib/avatar";
import setAvatar from "../../methods/setAvatar";
import Avatar from "./Avatar";

const Editor = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 24px;

  > div:last-child {
    flex: 1;
    min-width: 200px;
  }
`;
const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`;

async function prepareAvatar(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing unavailable");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AvatarEditor({ user }: { user: Meteor.User }) {
  const { t } = useTranslation();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const preview = draft === undefined ? user.avatarUrl : (draft ?? undefined);

  const select = async (file?: File) => {
    if (!file) return;
    setError(undefined);
    setSaved(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("profile.avatar.invalidFormat"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("profile.avatar.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      const data = await prepareAvatar(file);
      if (data.length > MAX_AVATAR_DATA_LENGTH) {
        setError(t("profile.avatar.tooLarge"));
      } else {
        setDraft(data);
      }
    } catch {
      setError(t("profile.avatar.invalidImage"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (draft === undefined) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      await setAvatar.callPromise({ avatar: draft });
      setDraft(undefined);
      setSaved(true);
    } catch {
      setError(t("profile.avatar.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="avatar-editor">
      <Editor>
        <Avatar {...user} avatarUrl={preview} size={80} />
        <div>
          <label htmlFor={inputId}>{t("profile.avatar.label")}</label>
          <div className="text-muted small">{t("profile.avatar.help")}</div>
          <input
            id={inputId}
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={busy}
            onChange={(event) => {
              void select(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <Buttons>
            <Button
              variant="outline-secondary"
              data-testid="avatar-choose"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {t("profile.avatar.choose")}
            </Button>
            {preview && (
              <Button
                variant="outline-secondary"
                data-testid="avatar-reset"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError(undefined);
                  setSaved(false);
                }}
              >
                {t("profile.avatar.reset")}
              </Button>
            )}
            {draft !== undefined && (
              <>
                <Button
                  variant="primary"
                  data-testid="avatar-save"
                  disabled={busy}
                  onClick={() => {
                    void save();
                  }}
                >
                  {busy ? t("common.saving") : t("profile.avatar.save")}
                </Button>
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(undefined);
                    setError(undefined);
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </>
            )}
          </Buttons>
        </div>
      </Editor>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" role="status">
          {t("profile.avatar.saved")}
        </Alert>
      )}
    </div>
  );
}
