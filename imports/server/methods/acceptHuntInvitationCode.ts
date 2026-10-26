import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { z } from "zod";
import Hunts from "../../lib/models/Hunts";
import InvitationCodes from "../../lib/models/InvitationCodes";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { primaryEmail } from "../../lib/models/User";
import acceptHuntInvitationCode from "../../methods/acceptHuntInvitationCode";
import addUserToHunt from "../addUserToHunt";
import emailConfigured from "../emailConfigured";
import defineMethod from "./defineMethod";

defineMethod(acceptHuntInvitationCode, {
  validate(arg) {
    check(arg, {
      invitationCode: String,
      email: Match.Optional(String),
    });
    if (arg.email !== undefined) {
      const email = z.string().trim().email().safeParse(arg.email);
      if (!email.success) throw new Meteor.Error(400, "请输入有效的电子邮箱。");
      return { ...arg, email: email.data };
    }
    return arg;
  },

  async run({ invitationCode, email }): Promise<string> {
    // Note: this method can be called either by a logged-in user without the `email` arg,
    // or by a logged-out user to use the invitation code to send themselves an invite via email.
    const invitation = await InvitationCodes.findOneAsync({
      code: invitationCode,
    });
    if (!invitation) {
      throw new Meteor.Error(404, "Invalid invitation code");
    }

    const hunt = await Hunts.findOneAsync({
      _id: invitation.hunt,
    });
    if (!hunt) {
      throw new Meteor.Error(404, "Hunt does not exist for invitation");
    }

    if (!email) {
      // User is logged in and accepting the invitation for themself.
      check(this.userId, String);
      const user = await MeteorUsers.findOneAsync(this.userId);
      const emailForExistingUser = user ? primaryEmail(user) : undefined;
      if (!emailForExistingUser) {
        throw new Meteor.Error(500, "No email found for current user");
      }

      await addUserToHunt({
        hunt,
        email: emailForExistingUser,
        invitedBy: this.userId,
      });
    } else {
      if (!emailConfigured())
        throw new Meteor.Error(
          503,
          "Email registration is unavailable. Join with Google instead.",
          "email-not-configured",
        );
      // If user is specifying an email, they are trying to redeem the invitation code to create a user with that email.
      await addUserToHunt({
        hunt,
        email,
        invitedBy: invitation.createdBy,
      });
    }

    return hunt._id;
  },
});
