import { Google } from "meteor/google-oauth";
import { Meteor } from "meteor/meteor";
import { OAuth } from "meteor/oauth";
import { useTracker } from "meteor/react-meteor-data";
import { ServiceConfiguration } from "meteor/service-configuration";
import type { ReactNode } from "react";
import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import type { FormControlProps } from "react-bootstrap/FormControl";
import FormControl from "react-bootstrap/FormControl";
import FormGroup from "react-bootstrap/FormGroup";
import FormLabel from "react-bootstrap/FormLabel";
import FormText from "react-bootstrap/FormText";
import {
  useTranslation as useStudioTranslation,
  useTranslation,
} from "react-i18next";
import Creatable from "react-select/creatable";
import styled from "styled-components";
import Flags from "../../Flags";
import isAdmin from "../../lib/isAdmin";
import DiscordCache from "../../lib/models/DiscordCache";
import type { FlagNames } from "../../lib/models/FeatureFlags";
import type { SavedDiscordObjectType } from "../../lib/models/Hunts";
import type { SettingType } from "../../lib/models/Settings";
import Settings from "../../lib/models/Settings";
import discordGuildsAll from "../../lib/publications/discordGuildsAll";
import settingsAll from "../../lib/publications/settingsAll";
import configureClearGdriveCreds from "../../methods/configureClearGdriveCreds";
import configureDiscordBot from "../../methods/configureDiscordBot";
import configureDiscordBotGuild from "../../methods/configureDiscordBotGuild";
import configureDiscordOAuthClient from "../../methods/configureDiscordOAuthClient";
import configureEmailBranding from "../../methods/configureEmailBranding";
import configureEnsureGoogleScript from "../../methods/configureEnsureGoogleScript";
import configureGdriveCreds from "../../methods/configureGdriveCreds";
import configureGdriveRoot from "../../methods/configureGdriveRoot";
import configureGdriveTemplates from "../../methods/configureGdriveTemplates";
import configureGoogleOAuthClient from "../../methods/configureGoogleOAuthClient";
import configureGoogleScriptUrl from "../../methods/configureGoogleScriptUrl";
import configureListS3Buckets from "../../methods/configureListS3Buckets";
import configureOrganizeGoogleDrive from "../../methods/configureOrganizeGoogleDrive";
import configureS3ImageBucket from "../../methods/configureS3ImageBucket";
import configureServerLanguage from "../../methods/configureServerLanguage";
import configureTeamName from "../../methods/configureTeamName";
import generateUploadToken from "../../methods/generateUploadToken";
import setFeatureFlag from "../../methods/setFeatureFlag";
import type { DiscordGuildType } from "../discord";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import studioI18n from "../i18n";
import lookupUrl from "../lookupUrl";
import ActionButtonRow from "./ActionButtonRow";

const PageContainer = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 8px 48px;
  color: var(--bs-body-color);
  h1 {
    font-size: 26px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  p,
  li {
    line-height: 1.7;
  }
  .form-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
  }
  .form-control {
    border-color: var(--bs-border-color);
    border-radius: 6px;
  }
  .form-control:focus {
    border-color: #4096ff;
    box-shadow: 0 0 0 2px #1677ff18;
  }
  .btn {
    border-radius: 6px;
    font-size: 14px;
  }
  .btn-primary {
    background: #1677ff;
    border-color: #1677ff;
  }
  .btn-secondary {
    background: var(--bs-body-bg);
    border-color: var(--bs-border-color);
    color: var(--bs-secondary-color);
  }
  .badge {
    font-weight: 500;
    font-size: 12px;
  }
  @media (max-width: 767px) {
    padding: 20px 0 32px;
  }
`;

const Section = styled.section`
  border: 1px solid var(--bs-border-color);
  border-radius: 10px;
  background: var(--bs-body-bg);
  padding: 0 24px 24px;
  overflow-wrap: anywhere;
  > p:first-of-type {
    color: var(--bs-secondary-color);
    margin-top: 20px;
  }
  @media (max-width: 767px) {
    padding: 0 16px 16px;
  }
`;

const SectionHeader = styled.h2`
  font-size: 18px;
  font-weight: 600;
  border-bottom: 1px solid var(--bs-border-color);
  margin: 0 -24px;
  padding: 18px 24px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  @media (max-width: 767px) {
    margin: 0 -16px;
    padding: 16px;
  }
`;

const SectionHeaderLabel = styled.span`
  flex: 1 1 auto;
`;

const SectionHeaderButtons = styled.span`
  flex: 0 0 auto;

  button {
    margin-left: 8px;
  }
`;

const Subsection = styled.div`
  padding: 24px 0;
  border-bottom: 1px solid var(--bs-border-color);
  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  > p,
  > ul {
    color: var(--bs-secondary-color);
    font-size: 14px;
  }
  form {
    max-width: 640px;
  }
`;

const SubsectionHeader = styled.h2`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
`;

const SettingsLayout = styled.div`
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  margin-top: 28px;
  [role="tablist"] {
    position: sticky;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  [role="tab"] {
    text-align: left;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--bs-secondary-color);
    padding: 12px 16px;
    font-size: 14px;
  }
  [role="tab"]:hover {
    background: var(--bs-tertiary-bg);
  }
  [role="tab"][aria-selected="true"] {
    color: #1677ff;
    background: var(--bs-primary-bg-subtle);
    font-weight: 500;
  }
  [role="tab"]:focus-visible {
    outline: 2px solid #1677ff;
    outline-offset: 2px;
  }
  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin-top: 20px;
    [role="tablist"] {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    [role="tab"] {
      white-space: nowrap;
      padding: 10px 12px;
    }
  }
`;

const AssetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const AdvancedAssets = styled.details`
  margin-top: 24px;
  border-top: 1px solid var(--bs-border-color);
  padding-top: 20px;
  summary {
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 16px;
  }
  > p {
    color: var(--bs-secondary-color);
    font-size: 14px;
  }
`;

enum SubmitState {
  IDLE = "idle",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  ERROR = "error",
}

const googleCompletenessStrings = () => [
  studioI18n.t("studio.messages.m236"),
  studioI18n.t("studio.messages.m237"),
  studioI18n.t("studio.messages.m238"),
  studioI18n.t("studio.messages.m239"),
  studioI18n.t("studio.messages.m240"),
];

type GoogleOAuthFormSubmitState =
  | {
      submitState:
        | SubmitState.IDLE
        | SubmitState.SUBMITTING
        | SubmitState.SUCCESS;
    }
  | {
      submitState: SubmitState.ERROR;
      submitError: string;
    };

const GoogleOAuthForm = ({
  isConfigured,
  initialClientId,
}: {
  isConfigured: boolean;
  initialClientId?: string;
}) => {
  useStudioTranslation();

  const [state, setState] = useState<GoogleOAuthFormSubmitState>({
    submitState: SubmitState.IDLE,
  });
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [clientSecret, setClientSecret] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setState({
      submitState: SubmitState.IDLE,
    });
  }, []);

  const onSubmitOauthConfiguration = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();

      const trimmedClientId = clientId.trim();
      const trimmedClientSecret = clientSecret.trim();

      if (trimmedClientId.length > 0 && trimmedClientSecret.length === 0) {
        setState({
          submitState: SubmitState.ERROR,
          submitError: studioI18n.t("studio.messages.m241"),
        });
      } else {
        setState({
          submitState: SubmitState.SUBMITTING,
        });
        configureGoogleOAuthClient.call(
          {
            clientId: trimmedClientId !== "" ? trimmedClientId : undefined,
            secret:
              trimmedClientSecret !== "" ? trimmedClientSecret : undefined,
          },
          (err) => {
            if (err) {
              setState({
                submitState: SubmitState.ERROR,
                submitError: err.message,
              });
            } else {
              setState({
                submitState: SubmitState.SUCCESS,
              });
            }
          },
        );
      }
    },
    [clientId, clientSecret],
  );

  const onClientIdChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setClientId(e.currentTarget.value);
    }, []);

  const onClientSecretChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setClientSecret(e.currentTarget.value);
    }, []);

  const shouldDisableForm = state.submitState === SubmitState.SUBMITTING;
  const secretPlaceholder = isConfigured
    ? studioI18n.t("studio.messages.m242")
    : "";
  return (
    <form onSubmit={onSubmitOauthConfiguration}>
      {state.submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {state.submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {state.submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {state.submitError}
        </Alert>
      ) : null}
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-google-client-id">
          {" "}
          {studioI18n.t("studio.messages.m245")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-google-client-id"
          type="text"
          value={clientId}
          disabled={shouldDisableForm}
          onChange={onClientIdChange}
        />
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-google-client-secret">
          {" "}
          {studioI18n.t("studio.messages.m246")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-google-client-secret"
          type="text"
          value={clientSecret}
          disabled={shouldDisableForm}
          onChange={onClientSecretChange}
          placeholder={secretPlaceholder}
        />
      </FormGroup>
      <ActionButtonRow>
        <Button
          variant="primary"
          type="submit"
          disabled={shouldDisableForm}
          onSubmit={onSubmitOauthConfiguration}
        >
          {" "}
          {studioI18n.t("studio.messages.m247")}{" "}
        </Button>
      </ActionButtonRow>
    </form>
  );
};

type GoogleAuthorizeDriveClientFormState =
  | {
      submitState:
        | SubmitState.IDLE
        | SubmitState.SUBMITTING
        | SubmitState.SUCCESS;
    }
  | {
      submitState: SubmitState.ERROR;
      error: Error;
    };

const GoogleAuthorizeDriveClientForm = () => {
  useStudioTranslation();

  const [state, setState] = useState<GoogleAuthorizeDriveClientFormState>({
    submitState: SubmitState.IDLE,
  });

  const dismissAlert = useCallback(() => {
    setState({ submitState: SubmitState.IDLE });
  }, []);

  const requestComplete = useCallback((token: string | Error) => {
    if (token instanceof Error) {
      setState({ submitState: SubmitState.ERROR, error: token });
      return;
    }
    const secret = OAuth._retrieveCredentialSecret(token);
    if (!secret) {
      setState({
        submitState: SubmitState.ERROR,
        error: new Error(studioI18n.t("studio.messages.m248")),
      });
      return;
    }
    setState({ submitState: SubmitState.SUBMITTING });
    configureGdriveCreds.call({ key: token, secret }, (error) => {
      if (error) {
        setState({ submitState: SubmitState.ERROR, error });
      } else {
        setState({ submitState: SubmitState.SUCCESS });
      }
    });
  }, []);

  const showPopup = useCallback(() => {
    if (!ServiceConfiguration.configurations.findOne({ service: "google" })) {
      setState({
        submitState: SubmitState.ERROR,
        error: new Error(studioI18n.t("studio.messages.m249")),
      });
      return false;
    }
    Google.requestCredential(
      {
        requestPermissions: [
          "email",
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/drive.activity.readonly",
          "https://www.googleapis.com/auth/script.projects",
          "https://www.googleapis.com/auth/script.deployments",
          "https://www.googleapis.com/auth/user.emails.read",
          "https://www.googleapis.com/auth/contacts.other.readonly",
        ],
        requestOfflineToken: true,
        forceApprovalPrompt: true,
      },
      requestComplete,
    );
    return false;
  }, [requestComplete]);

  return (
    <div>
      {state.submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {state.submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {state.submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {state.error.message}
        </Alert>
      ) : null}
      <Button variant="primary" onClick={showPopup}>
        {" "}
        {studioI18n.t("studio.messages.m250")}{" "}
      </Button>{" "}
      {studioI18n.t("studio.messages.m251")}{" "}
    </div>
  );
};

type GoogleDriveRootFormState =
  | {
      submitState:
        | SubmitState.IDLE
        | SubmitState.SUBMITTING
        | SubmitState.SUCCESS;
    }
  | {
      submitState: SubmitState.ERROR;
      error: Error;
    };

const GoogleDriveRootForm = ({ initialRootId }: { initialRootId?: string }) => {
  useStudioTranslation();

  const [state, setState] = useState<GoogleDriveRootFormState>({
    submitState: SubmitState.IDLE,
  });
  const [rootId, setRootId] = useState<string>(initialRootId ?? "");

  const dismissAlert = useCallback(() => {
    setState({ submitState: SubmitState.IDLE });
  }, []);

  const onRootIdChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (e) => {
      setRootId(e.currentTarget.value);
    },
    [],
  );

  const saveRootId = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const rootString = rootId.trim();
      const root = rootString.length > 0 ? rootString : undefined;
      setState({ submitState: SubmitState.SUBMITTING });
      configureGdriveRoot.call({ root }, (error) => {
        if (error) {
          setState({ submitState: SubmitState.ERROR, error });
        } else {
          setState({ submitState: SubmitState.SUCCESS });
        }
      });
    },
    [rootId],
  );

  const reorganizeGoogleDrive = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setState({ submitState: SubmitState.SUBMITTING });
      configureOrganizeGoogleDrive.call((error) => {
        if (error) {
          setState({ submitState: SubmitState.ERROR, error });
        } else {
          setState({ submitState: SubmitState.SUCCESS });
        }
      });
    },
    [],
  );

  const shouldDisableForm = state.submitState === SubmitState.SUBMITTING;

  return (
    <div>
      {state.submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {state.submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {state.submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {state.error.message}
        </Alert>
      ) : null}
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-google-drive-root">
          {" "}
          {studioI18n.t("studio.messages.m252")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-google-drive-root"
          type="text"
          value={rootId}
          disabled={shouldDisableForm}
          onChange={onRootIdChange}
        />
      </FormGroup>
      <ActionButtonRow>
        <Button
          variant="primary"
          onClick={saveRootId}
          disabled={shouldDisableForm}
        >
          {" "}
          {studioI18n.t("studio.messages.m247")}{" "}
        </Button>
      </ActionButtonRow>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-google-drive-reorganize">
          {" "}
          {studioI18n.t("studio.messages.m253")}{" "}
        </FormLabel>
        <div>
          <Button
            variant="secondary"
            id="jr-setup-edit-google-drive-reorganize"
            onClick={reorganizeGoogleDrive}
            disabled={shouldDisableForm}
          >
            {" "}
            {studioI18n.t("studio.messages.m254")}{" "}
          </Button>
        </div>
      </FormGroup>
    </div>
  );
};

type GoogleDriveTemplateFormState =
  | {
      submitState:
        | SubmitState.IDLE
        | SubmitState.SUBMITTING
        | SubmitState.SUCCESS;
    }
  | {
      submitState: SubmitState.ERROR;
      error: Error;
    };

const GoogleDriveTemplateForm = ({
  initialDocTemplate,
  initialSpreadsheetTemplate,
}: {
  initialDocTemplate?: string;
  initialSpreadsheetTemplate?: string;
}) => {
  useStudioTranslation();

  const [state, setState] = useState<GoogleDriveTemplateFormState>({
    submitState: SubmitState.IDLE,
  });
  const [docTemplate, setDocTemplate] = useState<string>(
    initialDocTemplate ?? "",
  );
  const [spreadsheetTemplate, setSpreadsheetTemplate] = useState<string>(
    initialSpreadsheetTemplate ?? "",
  );

  const dismissAlert = useCallback(() => {
    setState({ submitState: SubmitState.IDLE });
  }, []);

  const onSpreadsheetTemplateChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setSpreadsheetTemplate(e.currentTarget.value);
    }, []);

  const onDocTemplateChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setDocTemplate(e.currentTarget.value);
    }, []);

  const saveTemplates = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const ssTemplate = spreadsheetTemplate.trim();
      const ssId = ssTemplate.length > 0 ? ssTemplate : undefined;
      const docTemplateString = docTemplate.trim();
      const docId =
        docTemplateString.length > 0 ? docTemplateString : undefined;
      setState({
        submitState: SubmitState.SUBMITTING,
      });
      configureGdriveTemplates.call(
        {
          spreadsheetTemplate: ssId,
          documentTemplate: docId,
        },
        (error) => {
          if (error) {
            setState({ submitState: SubmitState.ERROR, error });
          } else {
            setState({ submitState: SubmitState.SUCCESS });
          }
        },
      );
    },
    [spreadsheetTemplate, docTemplate],
  );

  const shouldDisableForm = state.submitState === SubmitState.SUBMITTING;
  return (
    <div>
      {state.submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {state.submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {state.submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {state.error.message}
        </Alert>
      ) : null}
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-gdrive-sheet-template">
          {" "}
          {studioI18n.t("studio.messages.m255")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-gdrive-sheet-template"
          type="text"
          value={spreadsheetTemplate}
          disabled={shouldDisableForm}
          onChange={onSpreadsheetTemplateChange}
        />
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-gdrive-doc-template">
          {" "}
          {studioI18n.t("studio.messages.m256")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-gdrive-doc-template"
          type="text"
          value={docTemplate}
          disabled={shouldDisableForm}
          onChange={onDocTemplateChange}
        />
      </FormGroup>
      <ActionButtonRow>
        <Button
          variant="primary"
          onClick={saveTemplates}
          disabled={shouldDisableForm}
        >
          {" "}
          {studioI18n.t("studio.messages.m247")}{" "}
        </Button>
      </ActionButtonRow>
    </div>
  );
};

type GoogleScriptFormState =
  | {
      submitState:
        | SubmitState.IDLE
        | SubmitState.SUBMITTING
        | SubmitState.SUCCESS;
    }
  | {
      submitState: SubmitState.ERROR;
      error: Error;
    };

const GoogleScriptForm = ({
  app,
}: {
  app: (SettingType & { name: "google.script" })["value"] | undefined;
}) => {
  useStudioTranslation();

  const [state, setState] = useState<GoogleScriptFormState>({
    submitState: SubmitState.IDLE,
  });

  const dismissAlert = useCallback(() => {
    setState({ submitState: SubmitState.IDLE });
  }, []);

  const ensureScript = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setState({ submitState: SubmitState.SUBMITTING });
    configureEnsureGoogleScript.call((error) => {
      if (error) {
        setState({ submitState: SubmitState.ERROR, error });
      } else {
        setState({ submitState: SubmitState.SUCCESS });
      }
    });
  }, []);

  const [endpointUrl, setEndpointUrl] = useState(app?.endpointUrl ?? "");
  const onEndpointUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEndpointUrl(e.currentTarget.value);
    },
    [],
  );

  const saveEndpointUrl = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();

      setState({ submitState: SubmitState.SUBMITTING });
      configureGoogleScriptUrl.call(
        { url: endpointUrl !== "" ? endpointUrl : undefined },
        (error) => {
          if (error) {
            setState({ submitState: SubmitState.ERROR, error });
          } else {
            setState({ submitState: SubmitState.SUCCESS });
          }
        },
      );
    },
    [endpointUrl],
  );

  const shouldDisable = state.submitState === SubmitState.SUBMITTING;
  return (
    <>
      {state.submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {state.submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {state.submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {state.error.message}
        </Alert>
      ) : null}
      <p> {studioI18n.t("studio.messages.m257")} </p>
      <p> {studioI18n.t("studio.messages.m258")} </p>
      <p> {studioI18n.t("studio.messages.m259")}</p>
      <p> {studioI18n.t("studio.messages.m260")}</p>
      <ol>
        <li>
          {" "}
          {studioI18n.t("studio.messages.m261")}{" "}
          <a
            href="https://console.developers.google.com/apis/api/script.googleapis.com/overview"
            target="_blank"
            rel="noopener noreferrer"
          >
            {" "}
            {studioI18n.t("studio.messages.m262")}{" "}
          </a>{" "}
          {studioI18n.t("studio.messages.m263")}{" "}
        </li>
        <li>
          {" "}
          {studioI18n.t("studio.messages.m264")}{" "}
          <a
            href="https://script.google.com/home/usersettings"
            target="_blank"
            rel="noopener noreferrer"
          >
            {" "}
            {studioI18n.t("studio.messages.m265")}{" "}
          </a>{" "}
          {studioI18n.t("studio.messages.m266")}{" "}
        </li>
      </ol>
      <p> {studioI18n.t("studio.messages.m267")}</p>
      <p>
        <Button
          variant="primary"
          onClick={ensureScript}
          disabled={shouldDisable}
        >
          {app?.scriptId
            ? studioI18n.t("studio.messages.m41")
            : studioI18n.t("studio.messages.m268")}{" "}
          {studioI18n.t("studio.messages.m269")}{" "}
        </Button>
      </p>
      {app?.scriptId && (
        <>
          <p> {studioI18n.t("studio.messages.m270")}</p>
          <ol>
            <li>
              {" "}
              {studioI18n.t("studio.messages.m261")}{" "}
              <a
                href={`https://script.google.com/home/projects/${app.scriptId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {" "}
                {studioI18n.t("studio.messages.m271")}{" "}
              </a>
            </li>
            <li> {studioI18n.t("studio.messages.m272")}</li>
            <li> {studioI18n.t("studio.messages.m273")}</li>
            <li> {studioI18n.t("studio.messages.m274")}</li>
            <li> {studioI18n.t("studio.messages.m275")}</li>
            <li> {studioI18n.t("studio.messages.m276")}</li>
          </ol>
          <FormGroup className="mb-3">
            <FormLabel htmlFor="jr-setup-google-script-url">
              {" "}
              {studioI18n.t("studio.messages.m277")}{" "}
            </FormLabel>
            <FormControl
              id="jr-setup-google-script-url"
              type="text"
              value={endpointUrl}
              onChange={onEndpointUrlChange}
              disabled={shouldDisable}
            />
          </FormGroup>
          <ActionButtonRow>
            <Button
              variant="primary"
              onClick={saveEndpointUrl}
              disabled={shouldDisable}
            >
              {" "}
              {studioI18n.t("studio.messages.m247")}{" "}
            </Button>
          </ActionButtonRow>
        </>
      )}
    </>
  );
};

const FeatureToggle = ({
  enabled,
  onToggleEnabled,
}: {
  enabled: boolean;
  onToggleEnabled: React.MouseEventHandler<HTMLElement>;
}) => {
  useStudioTranslation();

  const firstButtonLabel = enabled
    ? studioI18n.t("studio.messages.m278")
    : studioI18n.t("studio.messages.m279");
  const secondButtonLabel = enabled
    ? studioI18n.t("studio.messages.m280")
    : studioI18n.t("studio.messages.m281");
  const firstButtonVariant = enabled ? "outline-secondary" : "secondary";
  const secondButtonVariant = enabled ? "secondary" : "outline-secondary";
  return (
    <>
      <Button
        variant={firstButtonVariant}
        disabled={enabled}
        onClick={onToggleEnabled}
      >
        {firstButtonLabel}
      </Button>
      <Button
        variant={secondButtonVariant}
        disabled={!enabled}
        onClick={onToggleEnabled}
      >
        {secondButtonLabel}
      </Button>
    </>
  );
};

const GoogleIntegrationSection = () => {
  useStudioTranslation();

  const enabled = useTracker(() => !Flags.active("disable.google"), []);
  const oauthSettings = useTracker(() => {
    return ServiceConfiguration.configurations.findOne({
      service: "google",
    }) as unknown as undefined | { clientId: string };
  }, []);
  const {
    gdriveCredential,
    root,
    docTemplate,
    spreadsheetTemplate,
    googleScriptApp,
  } = useTracker(() => {
    const rootSetting = Settings.findOne({ name: "gdrive.root" });
    const docTemplateSetting = Settings.findOne({
      name: "gdrive.template.document",
    });
    const spreadsheetTemplateSetting = Settings.findOne({
      name: "gdrive.template.spreadsheet",
    });
    const gdriveSetting = Settings.findOne({ name: "gdrive.credential" });
    const googleScriptAppSetting = Settings.findOne({ name: "google.script" });
    return {
      gdriveCredential: gdriveSetting,
      root: rootSetting?.value.id,
      docTemplate: docTemplateSetting?.value.id,
      spreadsheetTemplate: spreadsheetTemplateSetting?.value.id,
      googleScriptApp: googleScriptAppSetting?.value,
    };
  }, []);

  const onToggleEnabled = useCallback(() => {
    const newValue = !enabled;
    const ffValue = newValue ? "off" : ("on" as const);
    setFeatureFlag.call({ name: "disable.google", type: ffValue });
  }, [enabled]);

  const disconnectGdrive = useCallback(() => {
    configureClearGdriveCreds.call();
  }, []);

  const clientId = oauthSettings?.clientId ?? "";

  let stepsDone = 0;
  if (oauthSettings) {
    stepsDone += 1;
  }
  if (gdriveCredential) {
    stepsDone += 1;
  }
  if (spreadsheetTemplate) {
    stepsDone += 1;
  }
  if (googleScriptApp?.endpointUrl) {
    stepsDone += 1;
  }

  const comp = googleCompletenessStrings()[stepsDone];
  const compBadgeVariant = stepsDone === 4 ? "success" : "warning";
  const oauthBadgeLabel = oauthSettings
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const oauthBadgeVariant = oauthSettings ? "success" : "warning";
  const driveBadgeLabel = gdriveCredential
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const driveBadgeVariant = gdriveCredential ? "success" : "warning";
  const maybeDriveUserEmail = gdriveCredential?.value?.email;
  const rootBadgeLabel = root
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const rootBadgeVariant = root ? "success" : "info";
  const templateBadgeLabel = spreadsheetTemplate
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const templateBadgeVariant = spreadsheetTemplate ? "success" : "warning";
  const googleScriptBadgeLabel = googleScriptApp?.endpointUrl
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const googleScriptBadgeVariant = googleScriptApp?.endpointUrl
    ? "success"
    : "warning";

  return (
    <Section id="google">
      <SectionHeader>
        <SectionHeaderLabel>
          {" "}
          {studioI18n.t("studio.messages.m282")}
        </SectionHeaderLabel>
        <Badge bg={compBadgeVariant}>{comp}</Badge>
        <SectionHeaderButtons>
          <FeatureToggle enabled={enabled} onToggleEnabled={onToggleEnabled} />
        </SectionHeaderButtons>
      </SectionHeader>
      <p> {studioI18n.t("studio.messages.m283")}</p>
      <ol>
        <li> {studioI18n.t("studio.messages.m284")}</li>
        <li> {studioI18n.t("studio.messages.m285")}</li>
        <li> {studioI18n.t("studio.messages.m286")}</li>
        <li> {studioI18n.t("studio.messages.m287")}</li>
      </ol>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m288")}</span>{" "}
          <Badge bg={oauthBadgeVariant}>{oauthBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m289")}</p>
        <ul>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m290")}{" "}
            <a
              href="https://support.google.com/googleapi/answer/6158849"
              target="_blank"
              rel="noopener noreferrer"
            >
              {" "}
              {studioI18n.t("studio.messages.m291")}{" "}
            </a>{" "}
            {studioI18n.t("studio.messages.m292")}{" "}
          </li>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m293")}
            <strong> {studioI18n.t("studio.messages.m294")}</strong>{" "}
            {studioI18n.t("studio.messages.m295")}{" "}
            <span>{Meteor.absoluteUrl("")}</span>
          </li>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m293")}
            <strong> {studioI18n.t("studio.messages.m296")}</strong>{" "}
            {studioI18n.t("studio.messages.m295")}{" "}
            <span>{Meteor.absoluteUrl("/_oauth/google")}</span>
          </li>
        </ul>
        <p> {studioI18n.t("studio.messages.m297")}</p>
        <GoogleOAuthForm
          initialClientId={clientId}
          isConfigured={!!oauthSettings}
        />
      </Subsection>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m298")}</span>{" "}
          <Badge bg={driveBadgeVariant}>{driveBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m299")} </p>
        {maybeDriveUserEmail && (
          <p>
            {" "}
            {studioI18n.t("studio.messages.m300")}
            <strong>{maybeDriveUserEmail}</strong>.{" "}
            <Button onClick={disconnectGdrive}>
              {" "}
              {studioI18n.t("studio.messages.m301")}
            </Button>
          </p>
        )}
        <GoogleAuthorizeDriveClientForm />
      </Subsection>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m302")}</span>{" "}
          <Badge bg={rootBadgeVariant}>{rootBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m303")} </p>
        <ul>
          <li> {studioI18n.t("studio.messages.m304")} </li>
          <li> {studioI18n.t("studio.messages.m305")}</li>
          <li> {studioI18n.t("studio.messages.m306")}</li>
        </ul>
        <GoogleDriveRootForm initialRootId={root} />
      </Subsection>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m307")}</span>{" "}
          <Badge bg={templateBadgeVariant}>{templateBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m308")} </p>
        <ul>
          <li> {studioI18n.t("studio.messages.m309")}</li>
          <li> {studioI18n.t("studio.messages.m310")}</li>
          <li> {studioI18n.t("studio.messages.m311")}</li>
        </ul>
        <GoogleDriveTemplateForm
          initialSpreadsheetTemplate={spreadsheetTemplate}
          initialDocTemplate={docTemplate}
        />
      </Subsection>

      <AdvancedAssets>
        <summary>
          <span>Google Apps Script</span>{" "}
          <Badge bg={googleScriptBadgeVariant}>{googleScriptBadgeLabel}</Badge>
          {studioI18n.t("studio.messages.m312")}
        </summary>
        <GoogleScriptForm app={googleScriptApp} />
      </AdvancedAssets>
    </Section>
  );
};

const S3ImageBucketForm = ({
  initialConfig,
}: {
  initialConfig?: SettingType & { name: "s3.image_bucket" };
}) => {
  useStudioTranslation();

  const defaultValue = initialConfig?.value.bucketName;

  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<string[]>([]);

  const loadBuckets = useCallback(async () => {
    setLoading(true);
    const response = await configureListS3Buckets.callPromise();
    setBuckets(response);
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadBuckets();
  }, [loadBuckets]);

  const options = useMemo(
    () =>
      buckets.map((b) => {
        return { value: b, label: b };
      }),
    [buckets],
  );

  const formatCreateLabel = useCallback(
    (value: string) =>
      studioI18n.t("studio.templates.otherValue", { p0: value }),
    [],
  );

  const [selectedBucket, setSelectedBucket] = useState<string | undefined>(
    undefined,
  );

  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;

  const saveConfig = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();
      setSubmitState(SubmitState.SUBMITTING);
      configureS3ImageBucket.call({ bucketName: selectedBucket }, (err) => {
        if (err) {
          setSubmitState(SubmitState.ERROR);
          setSubmitError(err.message);
        } else {
          setSubmitState(SubmitState.SUCCESS);
        }
      });
    },
    [selectedBucket],
  );

  return (
    <form onSubmit={saveConfig}>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-s3-image-bucket">
          {" "}
          {studioI18n.t("studio.messages.m313")}{" "}
        </FormLabel>
        <Creatable
          isDisabled={shouldDisableForm}
          isClearable
          isLoading={loading}
          options={options}
          formatCreateLabel={formatCreateLabel}
          defaultValue={
            defaultValue ? { value: defaultValue, label: defaultValue } : null
          }
          onChange={(v) => setSelectedBucket(v?.value ?? undefined)}
        />
      </FormGroup>
      <ActionButtonRow>
        <Button type="submit" variant="primary" disabled={shouldDisableForm}>
          {" "}
          {studioI18n.t("studio.messages.m247")}{" "}
        </Button>
      </ActionButtonRow>
    </form>
  );
};

const AWSIntegrationSection = () => {
  useStudioTranslation();

  const imageBucketSettings = useTracker(
    () => Settings.findOne({ name: "s3.image_bucket" }),
    [],
  );

  const configured = !!imageBucketSettings?.value.bucketName;
  const badgeVariant = configured ? "success" : "warning";

  return (
    <Section id="aws">
      <SectionHeader>
        <SectionHeaderLabel>
          {" "}
          {studioI18n.t("studio.messages.m314")}
        </SectionHeaderLabel>
        <Badge bg={badgeVariant}>
          {configured
            ? studioI18n.t("studio.messages.m240")
            : studioI18n.t("studio.messages.m236")}
        </Badge>
      </SectionHeader>
      <p> {studioI18n.t("studio.messages.m315")} </p>
      <p>
        {" "}
        {studioI18n.t("studio.messages.m316")}
        <code>&quot;*&quot;</code> {studioI18n.t("studio.messages.m317")}{" "}
      </p>
      <p>
        {" "}
        {studioI18n.t("studio.messages.m318")}{" "}
        <a href="https://docs.aws.amazon.com/sdkref/latest/guide/environment-variables.html">
          {" "}
          {studioI18n.t("studio.messages.m319")}{" "}
        </a>{" "}
        {studioI18n.t("studio.messages.m320")}{" "}
      </p>

      <S3ImageBucketForm initialConfig={imageBucketSettings} />
    </Section>
  );
};

const EmailConfigForm = ({
  initialConfig,
}: {
  initialConfig?: SettingType & { name: "email.branding" };
}) => {
  useStudioTranslation();

  const [from, setFrom] = useState<string>(initialConfig?.value.from ?? "");
  const [enrollAccountSubject, setEnrollAccountSubject] = useState<string>(
    initialConfig?.value.enrollAccountMessageSubjectTemplate ?? "",
  );
  const [enrollAccountMessage, setEnrollAccountMessage] = useState<string>(
    initialConfig?.value.enrollAccountMessageTemplate ?? "",
  );
  const [existingJoinSubject, setExistingJoinSubject] = useState<string>(
    initialConfig?.value.existingJoinMessageSubjectTemplate ?? "",
  );
  const [existingJoinMessage, setExistingJoinMessage] = useState<string>(
    initialConfig?.value.existingJoinMessageTemplate ?? "",
  );
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onFromChange: NonNullable<FormControlProps["onChange"]> = useCallback(
    (e) => {
      setFrom(e.currentTarget.value);
    },
    [],
  );

  const onEnrollSubjectChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setEnrollAccountSubject(e.currentTarget.value);
    }, []);

  const onEnrollMessageChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setEnrollAccountMessage(e.currentTarget.value);
    }, []);

  const onJoinSubjectChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setExistingJoinSubject(e.currentTarget.value);
    }, []);

  const onJoinMessageChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setExistingJoinMessage(e.currentTarget.value);
    }, []);

  const saveConfig = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const trimmedFrom = from.trim();
      const trimmedEnrollAccountMessageSubject = enrollAccountSubject.trim();
      const trimmedEnrollAccountMessage = enrollAccountMessage.trim();
      const trimmedExistingJoinMessageSubject = existingJoinSubject.trim();
      const trimmedExistingJoinMessage = existingJoinMessage.trim();
      setSubmitState(SubmitState.SUBMITTING);
      configureEmailBranding.call(
        {
          from: trimmedFrom !== "" ? trimmedFrom : undefined,
          enrollSubject:
            trimmedEnrollAccountMessageSubject !== ""
              ? trimmedEnrollAccountMessageSubject
              : undefined,
          enrollMessage:
            trimmedEnrollAccountMessage !== ""
              ? trimmedEnrollAccountMessage
              : undefined,
          joinSubject:
            trimmedExistingJoinMessageSubject !== ""
              ? trimmedExistingJoinMessageSubject
              : undefined,
          joinMessage:
            trimmedExistingJoinMessage !== ""
              ? trimmedExistingJoinMessage
              : undefined,
        },
        (error) => {
          if (error) {
            setSubmitError(error.message);
            setSubmitState(SubmitState.ERROR);
          } else {
            setSubmitState(SubmitState.SUCCESS);
          }
        },
      );
    },
    [
      from,
      enrollAccountSubject,
      enrollAccountMessage,
      existingJoinSubject,
      existingJoinMessage,
    ],
  );

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;
  return (
    <div>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-email-from">
          {" "}
          {studioI18n.t("studio.messages.m321")}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-email-from"
          aria-describedby="jr-setup-edit-email-from-description"
          type="text"
          value={from}
          disabled={shouldDisableForm}
          onChange={onFromChange}
        />
        <FormText id="jr-setup-edit-email-from-description">
          {" "}
          {studioI18n.t("studio.messages.m322")}
          <code>MAIL_URL</code> {studioI18n.t("studio.messages.m323")}{" "}
        </FormText>
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-email-enroll-subject">
          {" "}
          {studioI18n.t("studio.messages.m324")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-email-enroll-subject"
          aria-describedby="jr-setup-edit-email-enroll-subject-description"
          type="text"
          value={enrollAccountSubject}
          disabled={shouldDisableForm}
          onChange={onEnrollSubjectChange}
        />
        <FormText id="jr-setup-edit-email-enroll-subject-description" muted>
          {" "}
          {studioI18n.t("studio.messages.m325")}
          <code>{"{{siteName}}"}</code>
          {studioI18n.t("studio.messages.m326")}
        </FormText>
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-email-enroll-message">
          {" "}
          {studioI18n.t("studio.messages.m327")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-email-enroll-message"
          aria-describedby="jr-setup-edit-email-enroll-message-description"
          as="textarea"
          rows={8}
          value={enrollAccountMessage}
          disabled={shouldDisableForm}
          onChange={onEnrollMessageChange}
        />
        <FormText id="jr-setup-edit-email-enroll-message-description" muted>
          {" "}
          {studioI18n.t("studio.messages.m325")}{" "}
          <ul>
            <li>
              <code>{"{{&url}}"}</code> {studioI18n.t(
                "studio.messages.m328",
              )}{" "}
            </li>
            <li>
              <code>{"{{email}}"}</code> {studioI18n.t(
                "studio.messages.m329",
              )}{" "}
            </li>
            <li>
              <code>{"{{siteName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m330")}{" "}
            </li>
            <li>
              <code>{"{{huntNamesCommaSeparated}}"}</code>{" "}
              {studioI18n.t("studio.messages.m331")}{" "}
            </li>
            <li>
              <code>{"{{#huntNamesCount}}"}</code>/
              <code>{"{{/huntNamesCount}}"}</code>{" "}
              {studioI18n.t("studio.messages.m332")}{" "}
            </li>
            <li>
              <code>{"{{mailingListsCommaSeparated}}"}</code>{" "}
              {studioI18n.t("studio.messages.m333")}{" "}
            </li>
            <li>
              <code>{"{{#mailingListsCount}}"}</code>/
              <code>{"{{/mailingListsCount}}"}</code>{" "}
              {studioI18n.t("studio.messages.m334")}{" "}
            </li>
          </ul>
        </FormText>
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-email-existing-join-subject">
          {" "}
          {studioI18n.t("studio.messages.m335")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-email-existing-join-subject"
          aria-describedby="jr-setup-edit-email-existing-join-subject-description"
          type="text"
          value={existingJoinSubject}
          disabled={shouldDisableForm}
          onChange={onJoinSubjectChange}
        />
        <FormText
          id="jr-setup-edit-email-existing-join-subject-description"
          muted
        >
          {" "}
          {studioI18n.t("studio.messages.m325")}{" "}
          <ul>
            <li>
              <code>{"{{siteName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m330")}{" "}
            </li>
            <li>
              <code>{"{{huntName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m336")}{" "}
            </li>
          </ul>
        </FormText>
      </FormGroup>
      <FormGroup className="mb-3">
        <FormLabel htmlFor="jr-setup-edit-email-existing-join-message">
          {" "}
          {studioI18n.t("studio.messages.m337")}{" "}
        </FormLabel>
        <FormControl
          id="jr-setup-edit-email-existing-join-message"
          aria-describedby="jr-setup-edit-email-existing-join-message-description"
          as="textarea"
          rows={8}
          value={existingJoinMessage}
          disabled={shouldDisableForm}
          onChange={onJoinMessageChange}
        />
        <FormText
          id="jr-setup-edit-email-existing-join-message-description"
          muted
        >
          {" "}
          {studioI18n.t("studio.messages.m325")}{" "}
          <ul>
            <li>
              <code>{"{{email}}"}</code> {studioI18n.t(
                "studio.messages.m338",
              )}{" "}
            </li>
            <li>
              <code>{"{{huntName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m339")}{" "}
            </li>
            <li>
              <code>{"{{siteName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m330")}{" "}
            </li>
            <li>
              <code>{"{{joinerName}}"}</code>{" "}
              {studioI18n.t("studio.messages.m340")}{" "}
            </li>
            <li>
              <code>{"{{mailingListsCommaSeparated}}"}</code>{" "}
              {studioI18n.t("studio.messages.m333")}{" "}
            </li>
            <li>
              <code>{"{{#mailingListsCount}}"}</code>/
              <code>{"{{/mailingListsCount}}"}</code>{" "}
              {studioI18n.t("studio.messages.m334")}{" "}
            </li>
          </ul>
        </FormText>
      </FormGroup>
      <ActionButtonRow>
        <Button
          variant="primary"
          onClick={saveConfig}
          disabled={shouldDisableForm}
        >
          {" "}
          {studioI18n.t("studio.messages.m247")}{" "}
        </Button>
      </ActionButtonRow>
    </div>
  );
};

const EmailConfigSection = () => {
  useStudioTranslation();

  const config = useTracker(() => {
    return Settings.findOne({ name: "email.branding" });
  }, []);
  const configured = !!config?.value.from;
  const badgeVariant = configured ? "success" : "warning";
  return (
    <Section id="email">
      <SectionHeader>
        <SectionHeaderLabel>
          {" "}
          {studioI18n.t("studio.messages.m341")}
        </SectionHeaderLabel>
        <Badge bg={badgeVariant}>
          {configured
            ? studioI18n.t("studio.messages.m240")
            : studioI18n.t("studio.messages.m236")}
        </Badge>
      </SectionHeader>
      <p> {studioI18n.t("studio.messages.m342")}</p>
      <ul>
        <li> {studioI18n.t("studio.messages.m343")}</li>
        <li> {studioI18n.t("studio.messages.m344")}</li>
        <li> {studioI18n.t("studio.messages.m345")}</li>
      </ul>
      <p> {studioI18n.t("studio.messages.m346")}</p>
      <p>
        {" "}
        {studioI18n.t("studio.messages.m347")}{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/janl/mustache.js"
        >
          {" "}
          {studioI18n.t("studio.messages.m348")}{" "}
        </a>{" "}
        {studioI18n.t("studio.messages.m349")}
        <code> {studioI18n.t("studio.messages.m350")}</code>{" "}
        {studioI18n.t("studio.messages.m351")}{" "}
      </p>
      <EmailConfigForm initialConfig={config} />
    </Section>
  );
};

const DiscordOAuthForm = ({ oauthSettings }: { oauthSettings: any }) => {
  useStudioTranslation();

  const [clientId, setClientId] = useState<string>(oauthSettings?.appId ?? "");
  const [clientSecret, setClientSecret] = useState<string>(
    oauthSettings?.secret ?? "",
  );
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onClientIdChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setClientId(e.currentTarget.value);
    }, []);

  const onClientSecretChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setClientSecret(e.currentTarget.value);
    }, []);

  const onSubmitOauthConfiguration = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();

      const trimmedClientId = clientId.trim();
      const trimmedClientSecret = clientSecret.trim();

      if (trimmedClientId.length > 0 && trimmedClientSecret.length === 0) {
        setSubmitError(studioI18n.t("studio.messages.m241"));
        setSubmitState(SubmitState.ERROR);
      } else {
        setSubmitState(SubmitState.SUBMITTING);
        configureDiscordOAuthClient.call(
          {
            clientId: trimmedClientId !== "" ? trimmedClientId : undefined,
            clientSecret:
              trimmedClientSecret !== "" ? trimmedClientSecret : undefined,
          },
          (err) => {
            if (err) {
              setSubmitError(err.message);
              setSubmitState(SubmitState.ERROR);
            } else {
              setSubmitState(SubmitState.SUCCESS);
            }
          },
        );
      }
    },
    [clientId, clientSecret],
  );

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;
  const configured = !!oauthSettings;
  const secretPlaceholder = configured
    ? studioI18n.t("studio.messages.m242")
    : "";
  return (
    <div>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}

      {/* TODO: UI for client ID and client secret */}
      <form onSubmit={onSubmitOauthConfiguration}>
        <FormGroup className="mb-3">
          <FormLabel htmlFor="jr-setup-edit-discord-client-id">
            {" "}
            {studioI18n.t("studio.messages.m245")}{" "}
          </FormLabel>
          <FormControl
            id="jr-setup-edit-discord-client-id"
            type="text"
            placeholder=""
            value={clientId}
            disabled={shouldDisableForm}
            onChange={onClientIdChange}
          />
        </FormGroup>
        <FormGroup className="mb-3">
          <FormLabel htmlFor="jr-setup-edit-discord-client-secret">
            {" "}
            {studioI18n.t("studio.messages.m246")}{" "}
          </FormLabel>
          <FormControl
            id="jr-setup-edit-discord-client-secret"
            type="text"
            placeholder={secretPlaceholder}
            value={clientSecret}
            disabled={shouldDisableForm}
            onChange={onClientSecretChange}
          />
        </FormGroup>
        <ActionButtonRow>
          <Button
            variant="primary"
            type="submit"
            onClick={onSubmitOauthConfiguration}
            disabled={shouldDisableForm}
          >
            {" "}
            {studioI18n.t("studio.messages.m247")}{" "}
          </Button>
        </ActionButtonRow>
      </form>
    </div>
  );
};

const DiscordBotForm = ({
  botToken: initialBotToken,
}: {
  botToken?: string;
}) => {
  useStudioTranslation();

  const [botToken, setBotToken] = useState<string>(initialBotToken ?? "");
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onBotTokenChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setBotToken(e.currentTarget.value);
    }, []);

  const onSubmitBotToken = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();
      const trimmedBotToken = botToken.trim();

      setSubmitState(SubmitState.SUBMITTING);
      configureDiscordBot.call(
        {
          token: trimmedBotToken !== "" ? trimmedBotToken : undefined,
        },
        (err) => {
          if (err) {
            setSubmitError(err.message);
            setSubmitState(SubmitState.ERROR);
          } else {
            setSubmitState(SubmitState.SUCCESS);
          }
        },
      );
    },
    [botToken],
  );

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;
  return (
    <div>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmitBotToken}>
        <FormGroup className="mb-3">
          <FormLabel htmlFor="jr-setup-edit-discord-bot-token">
            {" "}
            {studioI18n.t("studio.messages.m352")}{" "}
          </FormLabel>
          <FormControl
            id="jr-setup-edit-discord-bot-token"
            type="text"
            placeholder=""
            value={botToken}
            disabled={shouldDisableForm}
            onChange={onBotTokenChange}
          />
        </FormGroup>
        <ActionButtonRow>
          <Button
            variant="primary"
            type="submit"
            onClick={onSubmitBotToken}
            disabled={shouldDisableForm}
          >
            {" "}
            {studioI18n.t("studio.messages.m247")}{" "}
          </Button>
        </ActionButtonRow>
      </form>
    </div>
  );
};

const DiscordGuildForm = ({
  guild: initialGuild,
}: {
  // initial value from settings
  guild?: DiscordGuildType;
}) => {
  useStudioTranslation();

  useTypedSubscribe(discordGuildsAll);
  const guilds = useTracker(() => {
    return DiscordCache.find(
      { type: "guild" },
      { projection: { "object.id": 1, "object.name": 1 } },
    ).map((c) => c.object as SavedDiscordObjectType);
  }, []);
  const [guildId, setGuildId] = useState<string>(initialGuild?.id ?? "");
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onSelectedGuildChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      const newValue =
        e.currentTarget.value === "empty" ? "" : e.currentTarget.value;
      setGuildId(newValue);
    }, []);

  const onSaveGuild = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();

      const guild = guilds.find((g) => g.id === guildId);
      setSubmitState(SubmitState.SUBMITTING);
      configureDiscordBotGuild.call({ guild }, (err) => {
        if (err) {
          setSubmitError(err.message);
          setSubmitState(SubmitState.ERROR);
        } else {
          setSubmitState(SubmitState.SUCCESS);
        }
      });
    },
    [guilds, guildId],
  );

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;
  const noneOption = {
    id: "empty",
    name: studioI18n.t("studio.messages.m353"),
  };
  const formOptions = [noneOption, ...guilds];
  return (
    <div>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}

      <form onSubmit={onSaveGuild}>
        <FormGroup className="mb-3">
          <FormLabel htmlFor="jr-setup-edit-discord-bot-guild">
            {" "}
            {studioI18n.t("studio.messages.m354")}{" "}
          </FormLabel>
          <FormControl
            id="jr-setup-edit-discord-bot-guild"
            as="select"
            type="text"
            value={guildId}
            disabled={shouldDisableForm}
            onChange={onSelectedGuildChange}
          >
            {formOptions.map(({ id, name }) => {
              return (
                <option key={id} value={id}>
                  {name}
                </option>
              );
            })}
          </FormControl>
        </FormGroup>
        <ActionButtonRow>
          <Button
            variant="primary"
            type="submit"
            onClick={onSaveGuild}
            disabled={shouldDisableForm}
          >
            {" "}
            {studioI18n.t("studio.messages.m247")}{" "}
          </Button>
        </ActionButtonRow>
      </form>
    </div>
  );
};

const DiscordIntegrationSection = () => {
  useStudioTranslation();

  const enabled = useTracker(() => !Flags.active("disable.discord"), []);
  const oauthSettings = useTracker(
    () => ServiceConfiguration.configurations.findOne({ service: "discord" }),
    [],
  );
  const { botToken, guild } = useTracker(() => {
    const botSetting = Settings.findOne({ name: "discord.bot" });
    const guildSetting = Settings.findOne({ name: "discord.guild" });
    return {
      botToken: botSetting?.value.token,
      guild: guildSetting?.value.guild,
    };
  }, []);

  const onToggleEnabled = useCallback(() => {
    const newValue = !enabled;
    const ffValue = newValue ? "off" : ("on" as const);
    setFeatureFlag.call({ name: "disable.discord", type: ffValue });
  }, [enabled]);

  const configured = !!oauthSettings;
  const headerBadgeVariant = configured ? "success" : "warning";
  const clientId = oauthSettings?.appId;
  const addGuildLink = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=8`;
  const oauthBadgeLabel = oauthSettings
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const oauthBadgeVariant = oauthSettings ? "success" : "warning";
  const botBadgeLabel = botToken
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const botBadgeVariant = botToken ? "success" : "warning";
  const guildBadgeLabel = guild
    ? studioI18n.t("studio.messages.m240")
    : studioI18n.t("studio.messages.m236");
  const guildBadgeVariant = guild ? "success" : "warning";
  return (
    <Section id="discord">
      <SectionHeader>
        <SectionHeaderLabel>
          {" "}
          {studioI18n.t("studio.messages.m355")}
        </SectionHeaderLabel>
        <Badge bg={headerBadgeVariant}>
          {configured
            ? studioI18n.t("studio.messages.m240")
            : studioI18n.t("studio.messages.m236")}
        </Badge>
        {configured && (
          <SectionHeaderButtons>
            <FeatureToggle
              enabled={enabled}
              onToggleEnabled={onToggleEnabled}
            />
          </SectionHeaderButtons>
        )}
      </SectionHeader>

      <p> {studioI18n.t("studio.messages.m356")}</p>
      <ul>
        <li> {studioI18n.t("studio.messages.m357")}</li>
        <li> {studioI18n.t("studio.messages.m358")}</li>
        <li> {studioI18n.t("studio.messages.m359")}</li>
        <li> {studioI18n.t("studio.messages.m360")}</li>
      </ul>
      <p> {studioI18n.t("studio.messages.m361")}</p>
      <ol>
        <li> {studioI18n.t("studio.messages.m362")}</li>
        <li> {studioI18n.t("studio.messages.m363")}</li>
        <li> {studioI18n.t("studio.messages.m364")}</li>
      </ol>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m288")}</span>{" "}
          <Badge bg={oauthBadgeVariant}>{oauthBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m365")} </p>
        <p> {studioI18n.t("studio.messages.m366")}</p>
        <ol>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m367")}{" "}
            <a href="https://discord.com/developers/applications">
              https://discord.com/developers/applications
            </a>
          </li>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m368")}{" "}
            <span>{Meteor.absoluteUrl("/_oauth/discord")}</span>
          </li>
          <li> {studioI18n.t("studio.messages.m369")}</li>
          <li> {studioI18n.t("studio.messages.m370")}</li>
          <li> {studioI18n.t("studio.messages.m371")}</li>
          <li> {studioI18n.t("studio.messages.m372")}</li>
          <li>
            {" "}
            {studioI18n.t("studio.messages.m373")}{" "}
            <a href={addGuildLink}> {studioI18n.t("studio.messages.m374")}</a>.
          </li>
        </ol>
        <DiscordOAuthForm oauthSettings={oauthSettings} />
      </Subsection>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m375")}</span>{" "}
          <Badge bg={botBadgeVariant}>{botBadgeLabel}</Badge>
        </SubsectionHeader>
        <p> {studioI18n.t("studio.messages.m376")} </p>
        <DiscordBotForm botToken={botToken} />
      </Subsection>

      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m354")}</span>{" "}
          <Badge bg={guildBadgeVariant}>{guildBadgeLabel}</Badge>
        </SubsectionHeader>
        <p>
          {" "}
          {studioI18n.t("studio.messages.m377")}{" "}
          <a href={addGuildLink}> {studioI18n.t("studio.messages.m378")}</a>.
        </p>

        <DiscordGuildForm guild={guild} />
      </Subsection>
    </Section>
  );
};

const BrandingTeamName = () => {
  useStudioTranslation();

  const initialTeamName = useTracker(() => {
    const teamNameSetting = Settings.findOne({ name: "teamname" });
    return teamNameSetting?.value.teamName;
  }, []);

  const [teamName, setTeamName] = useState<string>(initialTeamName ?? "");
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const onTeamNameChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      setTeamName(e.currentTarget.value);
    }, []);

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      e.preventDefault();
      setSubmitState(SubmitState.SUBMITTING);
      configureTeamName.call(
        {
          teamName: teamName !== "" ? teamName : undefined,
        },
        (err) => {
          if (err) {
            setSubmitError(err.message);
            setSubmitState(SubmitState.ERROR);
          } else {
            setSubmitState(SubmitState.SUCCESS);
          }
        },
      );
    },
    [teamName],
  );

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;
  return (
    <div>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}

      <form onSubmit={onSubmit}>
        <FormGroup className="mb-3">
          <FormLabel htmlFor="jr-setup-edit-team-name">
            {" "}
            {studioI18n.t("studio.messages.m379")}
          </FormLabel>
          <FormControl
            id="jr-setup-edit-team-name"
            type="text"
            placeholder=""
            value={teamName}
            disabled={shouldDisableForm}
            onChange={onTeamNameChange}
          />
        </FormGroup>
        <ActionButtonRow>
          <Button
            variant="primary"
            type="submit"
            onClick={onSubmit}
            disabled={shouldDisableForm}
          >
            {" "}
            {studioI18n.t("studio.messages.m247")}{" "}
          </Button>
        </ActionButtonRow>
      </form>
    </div>
  );
};

const BrandingRow = styled.div`
  border: 1px solid var(--bs-border-color);
  border-radius: 8px;
  padding: 16px;
  .alert {
    font-size: 13px;
    margin-bottom: 12px;
  }
`;

const BrandingRowContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  p {
    font-size: 13px;
    color: var(--bs-secondary-color);
    margin: 6px 0 12px;
  }
  small {
    color: var(--bs-secondary-color);
    font-size: 12px;
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  label {
    display: inline-block;
    border: 1px solid var(--bs-border-color);
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    font-size: 13px;
    margin: 0;
  }
  label:hover {
    color: #1677ff;
    border-color: #1677ff;
  }
  input:focus-visible + label {
    outline: 2px solid #1677ff;
    outline-offset: 2px;
  }
`;

const BrandingRowImage = styled.div<{
  $backgroundImage: string;
  $backgroundSize: string;
}>`
  width: 100%;
  height: 112px;
  border-radius: 6px;
  background-color: #fafafa;
  background-position: center;
  background-repeat: no-repeat;
  background-image: url(${(props) => props.$backgroundImage});
  background-size: ${(props) => props.$backgroundSize};
`;

const BrandingAssetRow = ({
  asset,
  backgroundSize,
  children,
}: {
  asset: string;
  backgroundSize?: string;
  children?: ReactNode;
}) => {
  useStudioTranslation();

  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");

  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0]!;
        const UPLOAD_SIZE_LIMIT = 1024 * 1024; // 1 MiB
        if (file.size > UPLOAD_SIZE_LIMIT) {
          setSubmitError(
            studioI18n.t("studio.templates.fileTooLarge", {
              p0: file.name,
              p1: file.size,
              p2: UPLOAD_SIZE_LIMIT,
            }),
          );
          setSubmitState(SubmitState.ERROR);
          return;
        }
        setSubmitState(SubmitState.SUBMITTING);
        generateUploadToken.call(
          { assetName: asset, assetMimeType: file.type },
          (err, uploadToken) => {
            if (err) {
              setSubmitError(err.message);
              setSubmitState(SubmitState.ERROR);
            } else {
              fetch(`/asset/${uploadToken}`, {
                method: "POST",
                mode: "cors",
                cache: "no-cache",
                headers: {
                  "Content-Type": file.type,
                },
                body: file,
              })
                .then((resp: Response) => {
                  if (resp.ok) {
                    setSubmitState(SubmitState.SUCCESS);
                  } else {
                    setSubmitError(`${resp.status} ${resp.statusText}`);
                    setSubmitState(SubmitState.ERROR);
                  }
                })
                .catch((error: Error) => {
                  setSubmitError(error.message);
                  setSubmitState(SubmitState.ERROR);
                });
            }
          },
        );
      }
    },
    [asset],
  );

  // If no BlobMapping is present for this asset, fall back to the default one from the public/images folder
  const blobUrl = useTracker(() => lookupUrl(asset), [asset]);
  const assetLabels: Record<string, string> = {
    "brand.png": studioI18n.t("studio.messages.m380"),
    "brand@2x.png": studioI18n.t("studio.messages.m381"),
    "hero.png": studioI18n.t("studio.messages.m382"),
    "hero@2x.png": studioI18n.t("studio.messages.m383"),
    "android-chrome-192x192.png": studioI18n.t("studio.messages.m384"),
    "android-chrome-512x512.png": studioI18n.t("studio.messages.m385"),
    "apple-touch-icon.png": studioI18n.t("studio.messages.m386"),
    "favicon-16x16.png": studioI18n.t("studio.messages.m387"),
    "favicon-32x32.png": studioI18n.t("studio.messages.m388"),
    "mstile-150x150.png": studioI18n.t("studio.messages.m389"),
    "safari-pinned-tab.svg": studioI18n.t("studio.messages.m390"),
  };
  return (
    <BrandingRow>
      {submitState === SubmitState.SUBMITTING ? (
        <Alert variant="info"> {studioI18n.t("studio.messages.m243")}</Alert>
      ) : null}
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m54")}{" "}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {" "}
          {studioI18n.t("studio.messages.m244")}
          {submitError}
        </Alert>
      ) : null}
      <BrandingRowContent>
        <BrandingRowImage
          $backgroundImage={blobUrl}
          $backgroundSize={backgroundSize ?? "contain"}
        />
        <div>
          <strong>{assetLabels[asset] ?? asset}</strong>
          <p>{children}</p>
          <input
            id={`asset-input-${asset}`}
            type="file"
            accept={asset.endsWith(".svg") ? "image/svg+xml" : "image/png"}
            disabled={submitState === SubmitState.SUBMITTING}
            aria-label={studioI18n.t("studio.templates.uploadAsset", {
              p0: assetLabels[asset] ?? asset,
            })}
            onChange={onFileSelected}
          />
          <label htmlFor={`asset-input-${asset}`}>
            {submitState === SubmitState.SUBMITTING
              ? studioI18n.t("studio.messages.m391")
              : studioI18n.t("studio.messages.m392")}
          </label>{" "}
          <small>{asset}</small>
        </div>
      </BrandingRowContent>
    </BrandingRow>
  );
};

const BrandingSection = () => {
  useStudioTranslation();

  return (
    <Section id="branding">
      <SectionHeader>
        <SectionHeaderLabel>
          {" "}
          {studioI18n.t("studio.messages.m393")}
        </SectionHeaderLabel>
      </SectionHeader>
      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m379")}</span>
        </SubsectionHeader>
        <p>{studioI18n.t("studio.messages.m394")}</p>
        <BrandingTeamName />
      </Subsection>
      {/* Adding a new branding asset? Make sure to add it to imports/server/lookupUrl.ts as well */}
      <Subsection>
        <SubsectionHeader>
          <span> {studioI18n.t("studio.messages.m395")}</span>
        </SubsectionHeader>
        <p>{studioI18n.t("studio.messages.m396")}</p>
        <AssetGrid>
          <BrandingAssetRow asset="brand.png">
            {" "}
            {studioI18n.t("studio.messages.m397")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="brand@2x.png">
            {" "}
            {studioI18n.t("studio.messages.m398")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="hero.png" backgroundSize="contain">
            {" "}
            {studioI18n.t("studio.messages.m399")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="hero@2x.png" backgroundSize="contain">
            {" "}
            {studioI18n.t("studio.messages.m400")}{" "}
          </BrandingAssetRow>
        </AssetGrid>
      </Subsection>
      <AdvancedAssets>
        <summary>{studioI18n.t("studio.messages.m401")}</summary>
        <p>{studioI18n.t("studio.messages.m402")}</p>
        <AssetGrid>
          <BrandingAssetRow asset="android-chrome-192x192.png">
            {" "}
            {studioI18n.t("studio.messages.m403")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow
            asset="android-chrome-512x512.png"
            backgroundSize="contain"
          >
            {" "}
            {studioI18n.t("studio.messages.m404")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="apple-touch-icon.png">
            {" "}
            {studioI18n.t("studio.messages.m405")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="favicon-16x16.png">
            {" "}
            {studioI18n.t("studio.messages.m406")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="favicon-32x32.png">
            {" "}
            {studioI18n.t("studio.messages.m407")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow asset="mstile-150x150.png">
            {" "}
            {studioI18n.t("studio.messages.m408")}{" "}
          </BrandingAssetRow>
          <BrandingAssetRow
            asset="safari-pinned-tab.svg"
            backgroundSize="contain"
          >
            {" "}
            {studioI18n.t("studio.messages.m409")}{" "}
          </BrandingAssetRow>
        </AssetGrid>
      </AdvancedAssets>
    </Section>
  );
};

const CircuitBreaker = styled.div`
  margin-bottom: 16px;
`;

const CircuitBreakerRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  background: #eef;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-right: 4px;
`;

const CircuitBreakerLabel = styled.div`
  font-size: 16px;
  flex: 1 1 auto;
`;

const CircuitBreakerButtons = styled.div`
  flex: 0 0 auto;

  button {
    margin-left: 8px;
  }
`;

const CircuitBreakerControl = ({
  title,
  flagName,
  children,
}: {
  // What do you call this circuit breaker?
  title: string;

  // What is the database name for this flag
  flagName: (typeof FlagNames)[number];

  // some explanation of what this feature flag controls and why you might want to toggle it.
  children: React.ReactNode;
}) => {
  useStudioTranslation();

  // disabled should be false if the circuit breaker is not intentionally disabling the feature,
  // and true if the feature is currently disabled.
  // most features will have false here most of the time.
  const featureDisabled = useTracker(() => Flags.active(flagName), [flagName]);

  const onChangeCb = useCallback(() => {
    const desiredState = !featureDisabled;
    setFeatureFlag.call({ name: flagName, type: desiredState ? "on" : "off" });
  }, [flagName, featureDisabled]);

  // Is the feature that this circuit breaker disables currently available?
  const featureIsEnabled = !featureDisabled;

  return (
    <CircuitBreaker>
      <CircuitBreakerRow>
        <CircuitBreakerLabel>{title}</CircuitBreakerLabel>
        <CircuitBreakerButtons>
          <FeatureToggle
            enabled={featureIsEnabled}
            onToggleEnabled={onChangeCb}
          />
        </CircuitBreakerButtons>
      </CircuitBreakerRow>
      <div className="circuit-breaker-description">{children}</div>
    </CircuitBreaker>
  );
};

const CircuitBreakerSection = () => {
  useStudioTranslation();

  return (
    <Section id="circuit-breakers">
      <SectionHeader> {studioI18n.t("studio.messages.m410")}</SectionHeader>
      <p> {studioI18n.t("studio.messages.m411")} </p>
      <CircuitBreakerControl
        title={studioI18n.t("studio.messages.m412")}
        flagName="disable.gdrive_permissions"
      >
        <p> {studioI18n.t("studio.messages.m413")}</p>
        <p> {studioI18n.t("studio.messages.m414")} </p>
        <p> {studioI18n.t("studio.messages.m415")} </p>
        <p> {studioI18n.t("studio.messages.m416")} </p>
      </CircuitBreakerControl>
      <CircuitBreakerControl
        title={studioI18n.t("studio.messages.m417")}
        flagName="disable.gdrive_document_activity"
      >
        <p> {studioI18n.t("studio.messages.m418")}</p>
        <p> {studioI18n.t("studio.messages.m419")}</p>
      </CircuitBreakerControl>
      <CircuitBreakerControl
        title={studioI18n.t("studio.messages.m420")}
        flagName="disable.webrtc"
      >
        <p> {studioI18n.t("studio.messages.m421")} </p>
        <p> {studioI18n.t("studio.messages.m422")}</p>
      </CircuitBreakerControl>
      <CircuitBreakerControl
        title={studioI18n.t("studio.messages.m423")}
        flagName="disable.spectra"
      >
        <p> {studioI18n.t("studio.messages.m424")}</p>
        <p> {studioI18n.t("studio.messages.m425")}</p>
      </CircuitBreakerControl>
      <CircuitBreakerControl
        title={studioI18n.t("studio.messages.m426")}
        flagName="disable.dingwords"
      >
        <p> {studioI18n.t("studio.messages.m427")} </p>
        <p> {studioI18n.t("studio.messages.m428")}</p>
      </CircuitBreakerControl>
    </Section>
  );
};

const LanguageSection = () => {
  useStudioTranslation();

  const { t } = useTranslation();

  const initialLanguage = useTracker(() => {
    const languageSetting = Settings.findOne({ name: "language" });
    return languageSetting?.value.language ?? "en";
  }, []);
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [submitState, setSubmitState] = useState<SubmitState>(SubmitState.IDLE);
  const [submitError, setSubmitError] = useState<string>("");
  const dismissAlert = useCallback(() => {
    setSubmitState(SubmitState.IDLE);
  }, []);

  const onLanguageChange: NonNullable<FormControlProps["onChange"]> =
    useCallback((e) => {
      const newValue = e.currentTarget.value;
      setLanguage(newValue);
    }, []);

  const shouldDisableForm = submitState === SubmitState.SUBMITTING;

  const onSaveLanguage = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();

      setSubmitState(SubmitState.SUBMITTING);
      configureServerLanguage.call({ language }, (err) => {
        if (err) {
          setSubmitError(err.message);
          setSubmitState(SubmitState.ERROR);
        } else {
          setSubmitState(SubmitState.SUCCESS);
        }
      });
    },
    [language],
  );

  const idPrefix = useId();

  const formOptions = [
    {
      id: "en",
      name: "English",
    },
    {
      id: "zh",
      name: "中文",
    },
  ];
  return (
    <Section id="language">
      <SectionHeader>
        <SectionHeaderLabel>
          {t("serverSetup.language", "Language")}
        </SectionHeaderLabel>
      </SectionHeader>
      {submitState === SubmitState.SUCCESS ? (
        <Alert variant="success" dismissible onClose={dismissAlert}>
          {t("common.saveSuccess", "Saved changes.")}
        </Alert>
      ) : null}
      {submitState === SubmitState.ERROR ? (
        <Alert variant="danger" dismissible onClose={dismissAlert}>
          {`${t("common.saveFailed", "Saving failed")}: ${submitError}`}
        </Alert>
      ) : null}
      <form onSubmit={onSaveLanguage}>
        <FormGroup className="mb-3" controlId={`${idPrefix}-language`}>
          <FormLabel>
            {t(
              "serverSetup.languageHelp",
              "While clientside text uses i18n as chosen by the user, this is the language that serverside-generated text (e.g. system messages sent by jolly-roger in chat) will be rendered in.",
            )}
          </FormLabel>
          <FormControl
            as="select"
            type="text"
            value={language}
            onChange={onLanguageChange}
          >
            {formOptions.map(({ id, name }) => {
              return (
                <option key={id} value={id}>
                  {name}
                </option>
              );
            })}
          </FormControl>
        </FormGroup>
        <ActionButtonRow>
          <Button
            variant="primary"
            type="submit"
            onClick={onSaveLanguage}
            disabled={shouldDisableForm}
          >
            {t("common.save", "Save")}
          </Button>
        </ActionButtonRow>
      </form>
    </Section>
  );
};

const SetupPage = () => {
  useStudioTranslation();

  useBreadcrumb({
    title: studioI18n.t("studio.messages.m429"),
    path: "/setup",
  });

  const loading = useTypedSubscribe(settingsAll);
  const canConfigure = useTracker(() => isAdmin(Meteor.user()), []);
  const [activeSection, setActiveSection] = useState("google");
  const panels = [
    {
      id: "google",
      label: studioI18n.t("studio.messages.m430"),
      content: <GoogleIntegrationSection />,
    },
    {
      id: "branding",
      label: studioI18n.t("studio.messages.m393"),
      content: <BrandingSection />,
    },
    {
      id: "email",
      label: studioI18n.t("studio.messages.m431"),
      content: <EmailConfigSection />,
    },
    { id: "discord", label: "Discord", content: <DiscordIntegrationSection /> },
    {
      id: "storage",
      label: studioI18n.t("studio.messages.m432"),
      content: <AWSIntegrationSection />,
    },
    {
      id: "features",
      label: studioI18n.t("studio.messages.m433"),
      content: (
        <>
          <LanguageSection />
          <CircuitBreakerSection />
        </>
      ),
    },
  ];

  if (loading()) {
    return <div> {studioI18n.t("studio.messages.m85")}</div>;
  }

  if (!canConfigure) {
    return (
      <div>
        <h1> {studioI18n.t("studio.messages.m434")}</h1>
        <p> {studioI18n.t("studio.messages.m435")}</p>
      </div>
    );
  }

  return (
    <PageContainer>
      <h1>{studioI18n.t("studio.messages.m429")}</h1>
      <p style={{ color: "var(--bs-secondary-color)", marginBottom: 0 }}>
        {studioI18n.t("studio.messages.m436")}
      </p>
      <SettingsLayout>
        <div role="tablist" aria-label={studioI18n.t("studio.messages.m437")}>
          {panels.map((panel, index) => (
            <button
              key={panel.id}
              id={`settings-tab-${panel.id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === panel.id}
              aria-controls={`settings-panel-${panel.id}`}
              tabIndex={activeSection === panel.id ? 0 : -1}
              onClick={() => setActiveSection(panel.id)}
              onKeyDown={(event) => {
                let offset = 0;
                if (["ArrowRight", "ArrowDown"].includes(event.key)) offset = 1;
                if (["ArrowLeft", "ArrowUp"].includes(event.key)) offset = -1;
                if (!offset && !["Home", "End"].includes(event.key)) return;
                event.preventDefault();
                let nextIndex =
                  (index + offset + panels.length) % panels.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = panels.length - 1;
                const next = panels[nextIndex]!;
                setActiveSection(next.id);
                document
                  .querySelector<HTMLButtonElement>(`#settings-tab-${next.id}`)
                  ?.focus();
              }}
            >
              {panel.label}
            </button>
          ))}
        </div>
        <div>
          {panels.map((panel) => (
            <div
              key={panel.id}
              role="tabpanel"
              id={`settings-panel-${panel.id}`}
              aria-labelledby={`settings-tab-${panel.id}`}
              hidden={activeSection !== panel.id}
            >
              {panel.content}
            </div>
          ))}
        </div>
      </SettingsLayout>
    </PageContainer>
  );
};

export default SetupPage;
