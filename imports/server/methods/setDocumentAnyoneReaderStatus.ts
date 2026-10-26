import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import isAdmin from "../../lib/isAdmin";
import Documents from "../../lib/models/Documents";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userIsOperatorForHunt } from "../../lib/permission_stubs";
import setDocumentAnyoneReaderStatus from "../../methods/setDocumentAnyoneReaderStatus";
import {
  grantAnyoneReaderPermission,
  revokeAnyoneReaderPermission,
} from "../gdrive";
import defineMethod from "./defineMethod";

function userCanManageDocument(
  user: Meteor.User | null,
  hunt: Awaited<ReturnType<typeof Hunts.findOneAllowingDeletedAsync>>,
) {
  if (!user || !hunt) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  if (userIsOperatorForHunt(user, hunt)) {
    return true;
  }
  return user.hunts?.includes(hunt._id) ?? false;
}

defineMethod(setDocumentAnyoneReaderStatus, {
  validate(arg) {
    check(arg, {
      documentId: String,
      enable: Boolean,
    });
    return arg;
  },
  async run({ documentId, enable }) {
    check(this.userId, String);

    const user = (await MeteorUsers.findOneAsync(this.userId)) ?? null;
    const document = await Documents.findOneAsync(documentId);
    if (!document) {
      throw new Meteor.Error(404, "Unknown document");
    }

    const hunt = await Hunts.findOneAllowingDeletedAsync(document.hunt);
    if (!hunt) {
      throw new Meteor.Error(404, "Unknown hunt");
    }

    if (!userCanManageDocument(user, hunt)) {
      throw new Meteor.Error(403, "Not authorized");
    }

    if (!hunt.googleGroup) {
      throw new Meteor.Error(
        400,
        "Hunt does not restrict access to a Google group",
      );
    }

    if (document.provider !== "google") {
      throw new Meteor.Error(400, "Document provider is not Google");
    }

    this.unblock();

    if (enable) {
      Logger.info("Enabling anyone reader access", {
        documentId,
        fileId: document.value.id,
        huntId: hunt._id,
      });
      await grantAnyoneReaderPermission(document.value.id);
    } else {
      Logger.info("Revoking anyone reader access", {
        documentId,
        fileId: document.value.id,
        huntId: hunt._id,
      });
      await revokeAnyoneReaderPermission(document.value.id);
    }
  },
});
