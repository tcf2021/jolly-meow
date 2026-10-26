import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import MeteorUsers from "../lib/models/MeteorUsers";
import { scheduleHuntDocumentIndex } from "./automaticHuntDocumentIndex";
import withRenewedLock from "./withRenewedLock";

type GoogleIdentity = {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

// Called after retrieving verified Google credentials for registration.
export default async function provisionInvitedGoogleUser(
  identity: GoogleIdentity,
) {
  const { id, email, name, picture } = identity;
  if (!id || !email || identity.verified_email !== true)
    throw new Meteor.Error(
      403,
      "Google must verify your email before registration",
    );

  const userId = await withRenewedLock(
    `account-registration:${email.toLowerCase()}`,
    async () => {
      const existing = await Accounts.findUserByEmail(email);
      if (existing?.googleAccountId === id && !existing.mergedInto)
        return existing._id;
      if (
        existing &&
        (existing.services?.password?.bcrypt ||
          existing.googleAccountId ||
          existing.googleAccount ||
          existing.mergedInto)
      )
        throw new Meteor.Error(
          409,
          "An account already uses this email. Sign in and link Google in your profile.",
        );

      const userId =
        existing?._id ?? (await Accounts.createUserAsync({ email }));
      const address =
        existing?.emails?.find(
          (entry) => entry.address.toLowerCase() === email.toLowerCase(),
        )?.address ?? email;
      await MeteorUsers.updateAsync(
        { _id: userId, "emails.address": address },
        {
          $set: {
            googleAccount: email,
            googleAccountId: id,
            ...(picture ? { googleProfilePicture: picture } : {}),
            ...(name && !existing?.displayName ? { displayName: name } : {}),
            "emails.$.verified": true,
          },
          $unset: { "services.password.enroll": 1 },
        },
      );
      for (const huntId of existing?.hunts ?? [])
        scheduleHuntDocumentIndex(huntId, 0);
      return userId;
    },
  );
  return userId;
}
