import { Meteor } from "meteor/meteor";
import { OAuth } from "meteor/oauth";
import { useSubscribe, useTracker } from "meteor/react-meteor-data";
import { ServiceConfiguration } from "meteor/service-configuration";
import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import ListGroup from "react-bootstrap/ListGroup";
import ListGroupItem from "react-bootstrap/ListGroupItem";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import Flags from "../../Flags";
import { formatDiscordName } from "../../lib/discord";
import { indexedById } from "../../lib/listUtils";
import type { APIKeyType } from "../../lib/models/APIKeys";
import Dingwords, { type DingwordType } from "../../lib/models/Dingwords";
import addUserAccountEmail from "../../methods/addUserAccountEmail";
import createAPIKey from "../../methods/createAPIKey";
import linkUserDiscordAccount from "../../methods/linkUserDiscordAccount";
import makeUserEmailPrimary from "../../methods/makeUserEmailPrimary";
import removeUserAccountEmail from "../../methods/removeUserAccountEmail";
import sendUserVerificationEmail from "../../methods/sendUserVerificationEmail";
import unlinkUserDiscordAccount from "../../methods/unlinkUserDiscordAccount";
import updateProfile from "../../methods/updateProfile";
import { requestDiscordCredential } from "../discord";
import useTeamName from "../hooks/useTeamName";
import ActionButtonRow from "./ActionButtonRow";
import APIKeysTable from "./APIKeysTable";
import AudioConfig from "./AudioConfig";
import Avatar from "./Avatar";
import AvatarEditor from "./AvatarEditor";
import EditOwnDingwordsModal from "./EditOwnDingwordsModal";
import GoogleLinkBlock from "./GoogleLinkBlock";
import {
  CollapsibleSettings,
  ManagementCard,
  ManagementPage,
  PageHeader,
} from "./styling/ManagementPage";

enum DiscordLinkBlockLinkState {
  IDLE = "idle",
  LINKING = "linking",
  ERROR = "error",
}

const Dingword = styled.div<{ $saved: boolean }>`
  display: inline;
  padding: 2px 5px;
  margin: 0 5px 0 0;
  background-color: ${({ $saved, theme }) => ($saved ? theme.colors.dingwordSavedBackground : theme.colors.dingwordUnsavedBackground)};
  border-radius: 5px;
  border: 1px solid ${({ theme }) => theme.colors.dingwordBorder};
`;

type DiscordLinkBlockState =
  | {
      state: DiscordLinkBlockLinkState.IDLE | DiscordLinkBlockLinkState.LINKING;
    }
  | {
      state: DiscordLinkBlockLinkState.ERROR;
      error: Error;
    };

const DiscordLinkBlock = ({ user }: { user: Meteor.User }) => {
  const [state, setState] = useState<DiscordLinkBlockState>({
    state: DiscordLinkBlockLinkState.IDLE,
  });

  const config = useTracker(
    () => ServiceConfiguration.configurations.findOne({ service: "discord" }),
    [],
  );
  const discordDisabled = useTracker(() => Flags.active("disable.discord"), []);
  const { teamName } = useTeamName();

  const requestComplete = useCallback((token: string) => {
    const secret = OAuth._retrieveCredentialSecret(token);
    if (!secret) {
      setState({ state: DiscordLinkBlockLinkState.IDLE });
      return;
    }

    linkUserDiscordAccount.call({ key: token, secret }, (error) => {
      if (error) {
        setState({ state: DiscordLinkBlockLinkState.ERROR, error });
      } else {
        setState({ state: DiscordLinkBlockLinkState.IDLE });
      }
    });
  }, []);

  const onLink = useCallback(() => {
    setState({ state: DiscordLinkBlockLinkState.LINKING });
    requestDiscordCredential(requestComplete);
  }, [requestComplete]);

  const onUnlink = useCallback(() => {
    unlinkUserDiscordAccount.call();
  }, []);

  const dismissAlert = useCallback(() => {
    setState({ state: DiscordLinkBlockLinkState.IDLE });
  }, []);

  const { t } = useTranslation();

  const linkButton = useMemo(() => {
    if (state.state === DiscordLinkBlockLinkState.LINKING) {
      return (
        <Button variant="primary" disabled>
          Linking...
        </Button>
      );
    }

    if (discordDisabled) {
      return (
        <Button variant="primary" disabled>
          Discord integration currently disabled
        </Button>
      );
    }

    const text = user.discordAccount
      ? t("profile.discord.linkDifferent", "Link a different Discord account")
      : t("profile.discord.link", "Link your Discord account");

    return (
      <Button variant="primary" onClick={onLink}>
        {text}
      </Button>
    );
  }, [state.state, discordDisabled, user.discordAccount, onLink, t]);

  const unlinkButton = useMemo(() => {
    if (user.discordAccount) {
      return (
        <Button variant="danger" onClick={onUnlink}>
          {t("profile.discord.unlink", "Unlink")}
        </Button>
      );
    }

    return null;
  }, [user.discordAccount, onUnlink, t]);

  const currentAccount = useMemo(() => {
    if (user.discordAccount) {
      const acct = user.discordAccount;
      return <div>Currently linked to {formatDiscordName(acct)}</div>;
    }

    return null;
  }, [user.discordAccount]);

  if (!config) {
    return <div />;
  }

  return (
    <FormGroup className="mb-3">
      <FormLabel>{t("profile.discord.account", "Discord account")}</FormLabel>
      {state.state === DiscordLinkBlockLinkState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          Linking Discord account failed: {state.error.message}
        </Alert>
      ) : undefined}
      <div>
        {currentAccount}
        {linkButton} {unlinkButton}
      </div>
      <FormText>
        {t(
          "profile.discord.help",
          `Linking your Discord account will add you to the {{teamName}}
          Discord server. Additionally, we'll be able to link up your identity
          there and in jolly-roger chat.`,
          { teamName: teamName },
        )}
      </FormText>
    </FormGroup>
  );
};

const EmailSection = ({ user }: { user: Meteor.User }) => {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const handleAddEmail = useCallback(() => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(undefined);
    addUserAccountEmail.call({ email: trimmed }, (err) => {
      setBusy(false);
      if (err) {
        if (err instanceof Meteor.Error && err.error === 409) {
          setError(
            t(
              "profile.emails.conflict",
              "That email address belongs to another account. If you'd like to merge the accounts, contact an admin.",
            ),
          );
        } else {
          setError(err.reason ?? err.message);
        }
      } else {
        setNewEmail("");
      }
    });
  }, [newEmail, t]);

  const handleRemoveEmail = useCallback((email: string) => {
    setError(undefined);
    removeUserAccountEmail.call({ email }, (err) => {
      if (err) {
        setError(err.reason ?? err.message);
      }
    });
  }, []);

  const handleMakePrimary = useCallback((email: string) => {
    setError(undefined);
    makeUserEmailPrimary.call({ email }, (err) => {
      if (err) {
        setError(err.reason ?? err.message);
      }
    });
  }, []);

  const handleResendVerification = useCallback((email: string) => {
    setError(undefined);
    sendUserVerificationEmail.call({ email }, (err) => {
      if (err) {
        setError(err.reason ?? err.message);
      }
    });
  }, []);

  const emails = user.emails ?? [];

  return (
    <FormGroup className="mb-3">
      <FormLabel>{t("profile.emails.label", "Email addresses")}</FormLabel>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}
      <ListGroup className="mb-2">
        {emails.map((entry, index) => (
          <ListGroupItem
            key={entry.address}
            className="d-flex justify-content-between align-items-center"
          >
            <div>
              {entry.address}{" "}
              {index === 0 && (
                <Badge bg="primary">
                  {t("profile.emails.primary", "Primary")}
                </Badge>
              )}{" "}
              {entry.verified ? (
                <Badge bg="success">
                  {t("profile.emails.verified", "Verified")}
                </Badge>
              ) : (
                <Badge bg="warning" text="dark">
                  {t("profile.emails.unverified", "Unverified")}
                </Badge>
              )}
            </div>
            <div>
              {index !== 0 && entry.verified && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="me-1"
                  onClick={() => handleMakePrimary(entry.address)}
                >
                  {t("profile.emails.makePrimary", "Make primary")}
                </Button>
              )}
              {!entry.verified && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="me-1"
                  onClick={() => handleResendVerification(entry.address)}
                >
                  {t(
                    "profile.emails.resendVerification",
                    "Resend verification",
                  )}
                </Button>
              )}
              {index !== 0 && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleRemoveEmail(entry.address)}
                >
                  {t("profile.emails.remove", "Remove")}
                </Button>
              )}
            </div>
          </ListGroupItem>
        ))}
      </ListGroup>
      <div className="d-flex gap-2">
        <FormControl
          id={`${idPrefix}-add-email`}
          type="email"
          placeholder={t("profile.emails.addPlaceholder", "Add email address")}
          value={newEmail}
          onChange={(e) => setNewEmail(e.currentTarget.value)}
          disabled={busy}
        />
        <Button
          variant="outline-primary"
          onClick={handleAddEmail}
          disabled={busy || !newEmail.trim()}
        >
          {t("profile.emails.add", "Add")}
        </Button>
      </div>
    </FormGroup>
  );
};

enum OwnProfilePageSubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  ERROR = "error",
}

const APIKeysSection = ({ apiKeys }: { apiKeys?: APIKeyType[] }) => {
  const [createState, setCreateState] = useState<
    "idle" | "requesting" | "success" | "error"
  >("idle");
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const createKey = useCallback(() => {
    setCreateState("requesting");
    createAPIKey.call({}, (error, _newKey) => {
      if (error) {
        setCreateState("error");
        setCreateError(error.message);
      } else {
        setCreateState("success");
      }
    });
  }, []);
  const disabled = createState === "requesting";
  const { t } = useTranslation();
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3>{t("profile.apiKeys.label", "API Keys")}</h3>
        <Button disabled={disabled} onClick={createKey}>
          + {t("profile.apiKeys.create", "Create API key")}
        </Button>
      </div>
      {createState === "error" ? (
        <Alert
          variant="danger"
          onClose={() => setCreateState("idle")}
          dismissible
        >
          Creating API key failed: {createError}
        </Alert>
      ) : undefined}
      <p>
        {t(
          "profile.apiKeys.help",
          "Authorization credentials used to make API calls. Keep them secret!",
        )}
      </p>
      <APIKeysTable apiKeys={apiKeys} />
    </>
  );
};

const OwnProfilePage = ({
  initialUser,
  apiKeys,
}: {
  initialUser: Meteor.User;
  apiKeys?: APIKeyType[];
}) => {
  const [displayName, setDisplayName] = useState<string>(
    initialUser.displayName ?? "",
  );
  const dingwordsLoading = useSubscribe("allDingwords")();
  const dingwords = useTracker(() => {
    return dingwordsLoading
      ? new Map<string, DingwordType>()
      : indexedById(Dingwords.find().fetch());
  }, [dingwordsLoading]);
  // list of dingwords being edited
  const [draftDingwords, setDraftDingwords] = useState<string[]>([]);
  // saved dingwords
  const userDingwordsRef = useRef<string[]>([]);
  const addedDingwordsRef = useRef<
    { newDingword: string; parentId: string; clientId?: string }[]
  >([]);

  useEffect(() => {
    if (!dingwordsLoading) {
      const list = (initialUser.dingwords ?? [])
        .map((d) => {
          // filter out deleted and unselectable dingwords
          const dw = dingwords.get(d);
          if (!dw?.selectable) return null;
          return dw.name;
        })
        .filter((v) => v !== null);
      setDraftDingwords(list);
      userDingwordsRef.current = list;
    }
  }, [dingwordsLoading, dingwords, initialUser.dingwords]);

  const dingwordsModalRef =
    useRef<React.ComponentRef<typeof EditOwnDingwordsModal>>(null);
  const [renderDingwordModal, setRenderDingwordModal] =
    useState<boolean>(false);
  const onShowDingwordsModal = useCallback(() => {
    if (!dingwordsLoading && renderDingwordModal && dingwordsModalRef.current) {
      dingwordsModalRef.current.show();
    } else {
      setRenderDingwordModal(true);
    }
  }, [dingwordsLoading, renderDingwordModal]);

  const addDingword = (
    newDingword: string,
    parentId: string,
    clientId: string,
  ) => {
    addedDingwordsRef.current.push({ newDingword, parentId, clientId });
  };

  const [submitState, setSubmitState] = useState<OwnProfilePageSubmitState>(
    OwnProfilePageSubmitState.IDLE,
  );
  const [submitError, setSubmitError] = useState<string>("");

  const handleDisplayNameFieldChange: NonNullable<
    FormControlProps["onChange"]
  > = useCallback((e) => {
    setDisplayName(e.currentTarget.value);
  }, []);

  const handleSaveForm = useCallback(() => {
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName === "") {
      setSubmitError("Display name must not be empty");
      setSubmitState(OwnProfilePageSubmitState.ERROR);
      return;
    }

    setSubmitState(OwnProfilePageSubmitState.SUBMITTING);

    const newProfile = {
      displayName: trimmedDisplayName,
      dingwords: draftDingwords,
      addedDingwords: addedDingwordsRef.current,
    };
    updateProfile.call(newProfile, (error) => {
      if (error) {
        setSubmitError(error.message);
        setSubmitState(OwnProfilePageSubmitState.ERROR);
      } else {
        addedDingwordsRef.current = [];
        setSubmitState(OwnProfilePageSubmitState.SUCCESS);
      }
    });
  }, [displayName, draftDingwords]);

  const dismissAlert = useCallback(() => {
    setSubmitState(OwnProfilePageSubmitState.IDLE);
  }, []);

  const shouldDisableForm =
    submitState === OwnProfilePageSubmitState.SUBMITTING;

  const idPrefix = useId();

  const { t } = useTranslation();

  return (
    <ManagementPage>
      <PageHeader>
        <div>
          <h1>{t("profile.ownProfileTitle", "Account information")}</h1>
          <p>
            {t(
              "studio.management.profileHelp",
              "Manage your identity, linked accounts and preferences.",
            )}
          </p>
        </div>
        <Avatar {...initialUser} size={48} />
      </PageHeader>
      <ManagementCard>
        <EmailSection user={initialUser} />
        {submitState === OwnProfilePageSubmitState.SUBMITTING ? (
          <Alert variant="info">{t("common.saving", "Saving")}...</Alert>
        ) : null}
        {submitState === OwnProfilePageSubmitState.SUCCESS ? (
          <Alert variant="success" dismissible onClose={dismissAlert}>
            {t("common.saveSuccess", "Saved changes.")}
          </Alert>
        ) : null}
        {submitState === OwnProfilePageSubmitState.ERROR ? (
          <Alert variant="danger" dismissible onClose={dismissAlert}>
            {t("common.saveFailed", "Saving failed")}: {submitError}
          </Alert>
        ) : null}
      </ManagementCard>
      <ManagementCard>
        <h2>{t("studio.management.linkedAccounts", "Linked accounts")}</h2>
        <GoogleLinkBlock user={initialUser} />
        <DiscordLinkBlock user={initialUser} />
      </ManagementCard>
      <ManagementCard>
        <h2>{t("studio.management.basicProfile", "Profile")}</h2>

        <AvatarEditor user={initialUser} />

        <FormGroup className="mb-3" controlId={`${idPrefix}-display-name`}>
          <FormLabel>
            {t("profile.displayName.label", "Display name")}
          </FormLabel>
          <FormControl
            type="text"
            value={displayName}
            disabled={shouldDisableForm}
            onChange={handleDisplayNameFieldChange}
          />
          <FormText>
            {t(
              "profile.displayName.help",
              "We suggest your full name, to avoid ambiguity.",
            )}
          </FormText>
        </FormGroup>

        <FormGroup className="mb-3" controlId={`${idPrefix}-dingwords`}>
          <FormLabel>
            {t("profile.dingwords.label", "Dingwords (experimental)")}
          </FormLabel>
          <div>
            <FormText>
              {t(
                "profile.dingwords.help",
                `Get an in-app notification if anyone chooses to #<dingword> in
              chat. This feature is experimental and may be disabled without
              notice.`,
              )}
            </FormText>
          </div>
          <div style={{ margin: "10px 0" }}>
            {draftDingwords.map((d) => (
              <Dingword key={d} $saved={userDingwordsRef.current.includes(d)}>
                {d}
              </Dingword>
            ))}
          </div>
          <div>
            <Button
              variant="secondary"
              onClick={onShowDingwordsModal}
              disabled={dingwordsLoading}
            >
              {t("dingwords.edit", "Edit Dingwords")}
            </Button>
          </div>
          {renderDingwordModal && (
            <EditOwnDingwordsModal
              ref={dingwordsModalRef}
              updateDingwords={setDraftDingwords}
              recordAddedDingword={addDingword}
              dingwords={dingwords}
              initialDingwords={initialUser.dingwords ?? []}
            />
          )}
        </FormGroup>

        <ActionButtonRow>
          <FormGroup className="mb-3">
            <Button
              type="submit"
              variant="primary"
              disabled={shouldDisableForm}
              onClick={handleSaveForm}
            >
              {t("common.save", "Save")}
            </Button>
          </FormGroup>
        </ActionButtonRow>
      </ManagementCard>
      <CollapsibleSettings>
        <summary>
          {t("studio.management.audioSettings", "Audio settings")}
        </summary>
        <AudioConfig />
      </CollapsibleSettings>

      <CollapsibleSettings>
        <summary>{t("profile.advanced", "Advanced")}</summary>
        <APIKeysSection apiKeys={apiKeys} />
      </CollapsibleSettings>
    </ManagementPage>
  );
};

export default OwnProfilePage;
