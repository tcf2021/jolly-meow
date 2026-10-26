import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { faBoxArchive } from "@fortawesome/free-solid-svg-icons/faBoxArchive";
import { faEdit } from "@fortawesome/free-solid-svg-icons/faEdit";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons/faRotateLeft";
import { faTrash } from "@fortawesome/free-solid-svg-icons/faTrash";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useCallback, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Modal from "react-bootstrap/Modal";
import {
  useTranslation as useStudioTranslation,
  useTranslation,
} from "react-i18next";
import { LinkContainer } from "react-router-bootstrap";
import { Link } from "react-router-dom";
import isAdmin from "../../lib/isAdmin";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import {
  userMayCreateHunt,
  userMayPurgeHunt,
  userMayUpdateHunt,
} from "../../lib/permission_stubs";
import huntsAll from "../../lib/publications/huntsAll";
import setHuntArchived from "../../methods/setHuntArchived";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import HuntPurgeModal from "./HuntPurgeModal";
import type { ModalFormHandle } from "./ModalForm";
import {
  EmptyState,
  ManagementCard,
  ManagementPage,
  PageHeader,
} from "./styling/ManagementPage";

const Hunt = React.memo(({ hunt }: { hunt: HuntType }) => {
  useStudioTranslation();

  const huntId = hunt._id;

  const { canUpdate, canPurge, canArchive } = useTracker(() => {
    return {
      canUpdate: userMayUpdateHunt(Meteor.user(), hunt),

      canPurge: userMayPurgeHunt(Meteor.user(), hunt),
      canArchive: isAdmin(Meteor.user()),
    };
  }, [hunt]);

  const purgeModalRef = useRef<ModalFormHandle>(null);

  const showPurgeModal = useCallback(() => {
    if (purgeModalRef.current) {
      purgeModalRef.current.show();
    }
  }, []);

  const { t } = useTranslation();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState(false);
  const archiveLabel = t(
    hunt.archived ? "huntArchive.restore" : "huntArchive.archive",
  );
  return (
    <li className="d-flex align-items-center gap-3 py-3 border-bottom">
      <Modal
        show={archiveOpen}
        onHide={() => {
          if (!archiving) setArchiveOpen(false);
        }}
      >
        <Modal.Header closeButton={!archiving}>
          <Modal.Title>{archiveLabel}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {t(
            hunt.archived
              ? "huntArchive.restoreConfirm"
              : "huntArchive.confirm",
            { name: hunt.name },
          )}
          {archiveError && (
            <Alert variant="danger" className="mt-3 mb-0">
              {t("huntArchive.failed")}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            disabled={archiving}
            onClick={() => setArchiveOpen(false)}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={archiving}
            onClick={() => {
              setArchiving(true);
              setArchiveError(false);
              setHuntArchived.call(
                { huntId, archived: !hunt.archived },
                (error) => {
                  setArchiving(false);
                  if (error) setArchiveError(true);
                  else setArchiveOpen(false);
                },
              );
            }}
            data-testid="confirm-hunt-archive"
          >
            {archiveLabel}
          </Button>
        </Modal.Footer>
      </Modal>
      <HuntPurgeModal ref={purgeModalRef} hunt={hunt} />
      <Link className="fw-semibold me-auto" to={`/hunts/${huntId}`}>
        {hunt.name}
        {hunt.archived && (
          <Badge bg="secondary" className="ms-2">
            {t("huntArchive.archived")}
          </Badge>
        )}
      </Link>
      <ButtonGroup size="sm">
        {canArchive && (
          <Button
            variant="outline-secondary"
            title={archiveLabel}
            aria-label={archiveLabel}
            data-testid="hunt-archive-action"
            onClick={() => {
              setArchiveError(false);
              setArchiveOpen(true);
            }}
          >
            <FontAwesomeIcon
              icon={hunt.archived ? faRotateLeft : faBoxArchive}
            />
          </Button>
        )}
        {canUpdate ? (
          <LinkContainer to={`/hunts/${huntId}/edit`}>
            <Button
              as="a"
              variant="outline-secondary"
              title={`${t("huntList.edit.title", "Edit hunt")}...`}
            >
              <FontAwesomeIcon icon={faEdit} />
            </Button>
          </LinkContainer>
        ) : undefined}
        {canPurge ? (
          <Button
            onClick={showPurgeModal}
            variant="outline-danger"
            title={`${t("huntList.delete.title", "Delete hunt")}...`}
            aria-label={t("huntList.delete.title", "Delete hunt")}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        ) : undefined}
      </ButtonGroup>{" "}
    </li>
  );
});

const HuntListPage = () => {
  useStudioTranslation();

  const huntsLoading = useTypedSubscribe(huntsAll);
  const loading = huntsLoading();

  const hunts = useTracker(() =>
    Hunts.find({}, { sort: { createdAt: -1 } }).fetch(),
  );
  const { canAdd, myHunts } = useTracker(() => {
    return {
      canAdd: userMayCreateHunt(Meteor.user()),
      myHunts: new Set(Meteor.user()?.hunts),
    };
  }, []);

  const { t } = useTranslation();
  const joinedHunts = hunts.filter((h) => !h.archived && myHunts.has(h._id));
  const otherHunts = hunts.filter((h) => !h.archived && !myHunts.has(h._id));
  const archivedHunts = hunts.filter(
    (h) => h.archived && (myHunts.has(h._id) || canAdd),
  );
  const huntSections = [
    {
      id: "joined",
      title: t("huntArchive.activeSection"),
      items: joinedHunts,
      empty:
        myHunts.size > 0
          ? t("huntArchive.noActive")
          : t(
              "huntList.notInAnyHunt",
              "You're not a member of any hunts yet. Ask an operator to invite you.",
            ),
    },
    ...(canAdd
      ? [
          {
            id: "other",
            title: t("huntList.otherHunts", "Other hunts"),
            items: otherHunts,
            empty: t(
              "huntList.noOtherHunts",
              "There are no other hunts you haven't joined.",
            ),
          },
        ]
      : []),
    ...(archivedHunts.length > 0
      ? [
          {
            id: "archived",
            title: t("huntArchive.section"),
            items: archivedHunts,
            empty: "",
          },
        ]
      : []),
  ];

  return (
    <ManagementPage id="jr-hunts">
      <PageHeader>
        <div>
          <h1>{t("huntList.title", "Hunts")}</h1>
          <p>
            {t(
              "studio.management.huntsHelp",
              "Open a hunt to collaborate with your team.",
            )}
          </p>
        </div>
        {canAdd && (
          <LinkContainer to="/hunts/new">
            <Button as="a" variant="primary">
              {t("huntList.newHunt", "New hunt")}...
            </Button>
          </LinkContainer>
        )}
      </PageHeader>
      {loading ? (
        <ManagementCard>{t("common.loading", "Loading")}…</ManagementCard>
      ) : (
        huntSections.map((section) => (
          <ManagementCard key={section.id}>
            <h2>
              {section.title}{" "}
              <span className="text-secondary small">
                {section.items.length}
              </span>
            </h2>
            {section.items.length > 0 ? (
              <ul className="list-unstyled mb-0">
                {section.items.map((hunt) => (
                  <Hunt key={hunt._id} hunt={hunt} />
                ))}
              </ul>
            ) : (
              <EmptyState>{section.empty}</EmptyState>
            )}
          </ManagementCard>
        ))
      )}
    </ManagementPage>
  );
};

export default HuntListPage;
