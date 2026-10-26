import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { type SubmitEvent, useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import requestRegistration from "../../methods/requestRegistration";
import {
  AccountFormFrame,
  AccountFormSubmitState,
  useEmailField,
  useGoogleSignInCredentialsField,
} from "./AccountFormHelpers";

const RegisterForm = () => {
  const { t } = useTranslation();
  const { state: locationState } = useLocation();
  const [state, setState] = useState(AccountFormSubmitState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const submitting = state === AccountFormSubmitState.SUBMITTING;
  const showError = useCallback(
    (error: Error) => {
      const code = error instanceof Meteor.Error ? error.error : undefined;
      setErrorMessage(
        t(
          code === 409
            ? "registration.exists"
            : code === 503
              ? "registration.unavailable"
              : code === 400
                ? "registration.invalidEmail"
                : code === "too-many-requests"
                  ? "registration.rateLimit"
                  : "registration.failed",
        ),
      );
      setState(AccountFormSubmitState.FAILED);
    },
    [t],
  );
  const onGoogleCredentials = useCallback(
    ({ token, secret }: { token: string; secret: string }) => {
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
      setState(AccountFormSubmitState.SUBMITTING);
      Accounts.callLoginMethod({
        methodArguments: [
          {
            isJrLogin: true,
            registerWithoutInvitation: true,
            googleCredentials: { key: token, secret },
          },
        ],
        userCallback: (error?: Error) => {
          if (error) showError(error);
          else setState(AccountFormSubmitState.SUCCESS);
        },
      });
    },
    [showError],
  );
  const {
    googleAvailable,
    googleSignInCredentialsField,
    googleSignInSubmitState,
  } = useGoogleSignInCredentialsField({
    disabled: submitting,
    onCredentialsSet: onGoogleCredentials,
  });
  const busy =
    submitting || googleSignInSubmitState === AccountFormSubmitState.SUBMITTING;
  const { email, emailField } = useEmailField({
    disabled: busy,
    initialValue: locationState?.email ?? "",
    explanation: t("registration.emailHelp"),
  });
  const onSubmitForm = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || !email.trim()) return;
      setErrorMessage(undefined);
      setSuccessMessage(undefined);
      setState(AccountFormSubmitState.SUBMITTING);
      requestRegistration.call({ email: email.trim() }, (error) => {
        if (error) showError(error);
        else {
          setSuccessMessage(t("registration.sent", { email: email.trim() }));
          setState(AccountFormSubmitState.SUCCESS);
        }
      });
    },
    [busy, email, showError, t],
  );

  return (
    <AccountFormFrame
      title={t("registration.title")}
      state={state}
      onSubmitForm={onSubmitForm}
      errorMessage={errorMessage}
      successMessage={successMessage}
    >
      {emailField}
      <div className="d-grid gap-2">
        <Button type="submit" disabled={busy || !email.trim()}>
          {t("registration.send")}
        </Button>
      </div>
      {googleAvailable && (
        <div className="d-grid gap-2 mt-3 justify-content-center">
          {googleSignInCredentialsField}
        </div>
      )}
      <p className="mt-3 mb-0 text-center">
        <Link to="/login" state={{ email }}>
          {t("registration.login")}
        </Link>
      </p>
    </AccountFormFrame>
  );
};

export default RegisterForm;
