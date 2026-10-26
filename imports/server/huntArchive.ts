import { Meteor } from "meteor/meteor";
import i18n from "i18next";
import ChatMessages from "../lib/models/ChatMessages";
import Guesses from "../lib/models/Guesses";
import Hints from "../lib/models/Hints";
import Hunts from "../lib/models/Hunts";
import InvitationCodes from "../lib/models/InvitationCodes";
import Puzzles from "../lib/models/Puzzles";
import Tags from "../lib/models/Tags";
import { serverLanguage } from "./lang";

export async function assertHuntWritable(huntId: string) {
  if ((await Hunts.findOneAsync(huntId))?.archived)
    throw new Meteor.Error(
      403,
      i18n.t("huntArchive.readOnly", { lng: serverLanguage }),
    );
}

// Only shared website content is frozen. Whiteboard edits, Sheet image uploads,
// bookmarks, notification dismissals and voice presence keep their own checks.
const policies: Record<
  string,
  "hunt" | "puzzle" | "tag" | "guess" | "hint" | "message" | "invitation"
> = {
  "Hunts.methods.update": "hunt",
  "Hunts.methods.destroy": "hunt",
  "Hunts.methods.undestroy": "hunt",
  "Hunts.methods.purge": "hunt",
  "Hunts.methods.addUser": "hunt",
  "Hunts.methods.bulkAddUsers": "hunt",
  "Hunts.methods.clearHuntInvitationCode": "hunt",
  "Hunts.methods.generateHuntInvitationCode": "hunt",
  "Hunts.methods.acceptHuntInvitationCode": "invitation",
  "Hunts.methods.refreshDocumentIndex": "hunt",
  "Hunts.methods.syncDiscordRole": "hunt",
  "Users.method.removeFromHunt": "hunt",
  "Users.method.promoteOperator": "hunt",
  "Users.method.demoteOperator": "hunt",
  "Announcements.methods.post": "hunt",
  "Puzzles.methods.create": "hunt",
  "Puzzles.methods.update": "puzzle",
  "Puzzles.methods.destroy": "puzzle",
  "Puzzles.methods.undestroy": "puzzle",
  "Puzzles.methods.purge": "puzzle",
  "Puzzles.methods.addAnswer": "puzzle",
  "Puzzles.methods.removeAnswer": "puzzle",
  "Puzzles.methods.addTag": "puzzle",
  "Puzzles.methods.removeTag": "puzzle",
  "Tags.methods.rename": "tag",
  "Hunts.methods.moveGroup": "hunt",
  "ChatMessages.methods.send": "puzzle",
  "ChatMessages.methods.createImageUpload": "puzzle",
  "ChatMessages.methods.delete": "message",
  "ChatMessages.methods.setPin": "message",
  "Guesses.method.create": "puzzle",
  "Guesses.methods.setState": "guess",
  "jrHints.submit": "puzzle",
  "jrHints.updateField": "hint",
  "jrHints.setPriority": "hint",
  "jrHints.cancel": "hint",
  "jrHints.delete": "hint",
};

export async function checkMethodHuntArchive(name: string, value: unknown) {
  const policy = policies[name];
  if (!policy || !value || typeof value !== "object") return;
  const args = value as Record<string, unknown>;
  let huntId: string | undefined;
  const id = args[`${policy}Id`];
  if (policy === "hunt" && typeof id === "string") huntId = id;
  else if (policy === "invitation" && typeof args.invitationCode === "string")
    huntId = (await InvitationCodes.findOneAsync({ code: args.invitationCode }))
      ?.hunt;
  else if (typeof id === "string") {
    switch (policy) {
      case "puzzle":
        huntId = (await Puzzles.findOneAllowingDeletedAsync(id))?.hunt;
        break;
      case "tag":
        huntId = (await Tags.findOneAsync(id))?.hunt;
        break;
      case "guess":
        huntId = (await Guesses.findOneAsync(id))?.hunt;
        break;
      case "hint":
        huntId = (await Hints.findOneAsync(id))?.huntId;
        break;
      case "message":
        huntId = (await ChatMessages.findOneAsync(id))?.hunt;
        break;
      default:
        break;
    }
  }
  if (huntId) await assertHuntWritable(huntId);
}
