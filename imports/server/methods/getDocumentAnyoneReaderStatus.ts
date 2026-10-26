import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import isAdmin from "../../lib/isAdmin";
import Documents from "../../lib/models/Documents";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userIsOperatorForHunt } from "../../lib/permission_stubs";
import getDocumentAnyoneReaderStatus from "../../methods/getDocumentAnyoneReaderStatus";
import { documentHasAnyoneReaderPermission } from "../gdrive";
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

defineMethod(getDocumentAnyoneReaderStatus, {
  validate(arg) {
    check(arg, {
      documentId: String,
    });
    return arg;
  },
  async run({ documentId }) {
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
      return false;
    }

    if (document.provider !== "google") {
      return false;
    }

    return documentHasAnyoneReaderPermission(document.value.id);
  },
});
