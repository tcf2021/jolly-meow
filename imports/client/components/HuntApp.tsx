import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import React, { useCallback } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import Modal from "react-bootstrap/Modal";
import { createPortal } from "react-dom";
import { useTranslation as useStudioTranslation } from "react-i18next";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import { primaryEmail } from "../../lib/models/User";
import {
  userMayAddUsersToHunt,
  userMayUpdateHunt,
} from "../../lib/permission_stubs";
import huntForHuntApp from "../../lib/publications/huntForHuntApp";
import acceptUserHuntTerms from "../../methods/acceptUserHuntTerms";
import addHuntUser from "../../methods/addHuntUser";
import undestroyHunt from "../../methods/undestroyHunt";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useDocumentTitle from "../hooks/useDocumentTitle";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import studioI18n from "../i18n";
import Markdown from "./Markdown";

const HuntDeletedError = React.memo(
  ({ hunt, canUndestroy }: { hunt: HuntType; canUndestroy: boolean }) => {
    useStudioTranslation();

    const undestroy = useCallback(() => {
      undestroyHunt.call({ huntId: hunt._id });
    }, [hunt._id]);

    const undestroyButton = (() => {
      if (canUndestroy) {
        return (
          <Button variant="primary" onClick={undestroy}>
            {" "}
            {studioI18n.t("studio.messages.m103")}{" "}
          </Button>
        );
      }
      return null;
    })();

    const navigate = useNavigate();
    const goBack = useCallback(() => navigate(-1), [navigate]);

    return (
      <div>
        <Alert variant="danger"> {studioI18n.t("studio.messages.m104")}</Alert>

        <ButtonToolbar>
          <Button variant="light" onClick={goBack}>
            {" "}
            {studioI18n.t("studio.messages.m105")}{" "}
          </Button>
          {undestroyButton}
        </ButtonToolbar>
      </div>
    );
  },
);

const HuntMemberError = React.memo(
  ({ hunt, canJoin }: { hunt: HuntType; canJoin: boolean }) => {
    useStudioTranslation();

    const join = useCallback(() => {
      const user = Meteor.user();
      if (!user) {
        return;
      }
      const email = primaryEmail(user);
      if (!email) {
        return;
      }
      addHuntUser.call({ huntId: hunt._id, email });
    }, [hunt._id]);

    const joinButton = (() => {
      if (canJoin) {
        return (
          <Button variant="primary" onClick={join}>
            {studioI18n.t("studio.messages.m106")}
          </Button>
        );
      }
      return null;
    })();

    const navigate = useNavigate();
    const goBack = useCallback(() => navigate(-1), [navigate]);

    return (
      <div>
        <Alert variant="warning">
          {studioI18n.t("studio.messages.m107")}
          {hunt.name}。
        </Alert>

        <Markdown text={hunt.signupMessage ?? ""} />

        <ButtonToolbar>
          <Button variant="light" onClick={goBack}>
            {studioI18n.t("studio.messages.m108")}
          </Button>
          {joinButton}
        </ButtonToolbar>
      </div>
    );
  },
);

const HuntApp = React.memo(() => {
  useStudioTranslation();

  const huntId = useParams<"huntId">().huntId!;
  const location = useLocation();

  const huntLoading = useTypedSubscribe(huntForHuntApp, { huntId });
  const loading = huntLoading();

  const hunt = useTracker(() => Hunts.findOneAllowingDeleted(huntId), [huntId]);
  const { member, canUndestroy, canJoin, mustAcceptTerms } = useTracker(() => {
    const user = Meteor.user();
    const termsAccepted = user?.huntTermsAcceptedAt?.[huntId] ?? false;
    return {
      member: user?.hunts?.includes(huntId) ?? false,
      canUndestroy: userMayUpdateHunt(user, hunt),
      canJoin: userMayAddUsersToHunt(user, hunt),
      mustAcceptTerms: hunt?.termsOfUse && !termsAccepted,
    };
  }, [huntId, hunt]);

  const acceptTerms = useCallback(
    () => acceptUserHuntTerms.call({ huntId }),
    [huntId],
  );

  useBreadcrumb({
    title: loading || !hunt ? studioI18n.t("studio.messages.m85") : hunt.name,
    path: `/hunts/${huntId}`,
  });

  const title = hunt ? `${hunt.name} :: Jolly Meow` : "";

  useDocumentTitle(title);

  if (loading) {
    return <span> {studioI18n.t("studio.messages.m85")}</span>;
  }

  if (!hunt) {
    return <span> {studioI18n.t("studio.messages.m109")}</span>;
  }

  if (hunt.deleted) {
    return <HuntDeletedError hunt={hunt} canUndestroy={canUndestroy} />;
  }

  if (!member) {
    return <HuntMemberError hunt={hunt} canJoin={canJoin} />;
  }
  const page = location.pathname.split("/")[3];
  if (
    (page === "firehose" && hunt.hasChat === false) ||
    (page === "hints" && hunt.hasHints === false) ||
    (page === "guesses" && !hunt.hasGuessQueue)
  ) {
    return <Navigate to={`/hunts/${huntId}/puzzles`} replace />;
  }

  let termsModal = null;
  if (mustAcceptTerms) {
    termsModal = createPortal(
      <Modal show size="lg">
        <Modal.Body>
          <Markdown text={hunt.termsOfUse!} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={acceptTerms}>
            {" "}
            {studioI18n.t("studio.messages.m110")}{" "}
          </Button>
        </Modal.Footer>
      </Modal>,
      document.body,
    );
  }

  return (
    <>
      {termsModal}
      {hunt.archived &&
        !(page === "puzzles" && location.pathname.split("/")[4]) && (
          <Alert
            variant="secondary"
            className="m-2 py-2"
            data-testid="hunt-archive-notice"
          >
            {studioI18n.t("huntArchive.readOnly")}
          </Alert>
        )}
      <Outlet />
    </>
  );
});

export default HuntApp;
