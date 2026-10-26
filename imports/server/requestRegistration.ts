import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import emailConfigured from "./emailConfigured";
import withRenewedLock from "./withRenewedLock";

export default async function requestRegistration(email: string) {
  if (!emailConfigured())
    throw new Meteor.Error(503, "Email registration is not configured");

  await withRenewedLock(
    `account-registration:${email.toLowerCase()}`,
    async () => {
      const existing = await Accounts.findUserByEmail(email);
      if (
        existing &&
        (existing.services?.password?.bcrypt ||
          existing.googleAccountId ||
          existing.googleAccount ||
          existing.mergedInto)
      )
        throw new Meteor.Error(409, "An account already uses this email");

      // Reuse an incomplete account without changing its memberships or profile.
      // A recent enrollment link remains valid; avoid repeatedly mailing it.
      const lastSent = existing?.services?.password?.enroll?.when;
      if (lastSent instanceof Date && Date.now() - lastSent.getTime() < 60_000)
        return;
      const userId =
        existing?._id ?? (await Accounts.createUserAsync({ email }));
      try {
        const address =
          existing?.emails?.find(
            (entry) => entry.address.toLowerCase() === email.toLowerCase(),
          )?.address ?? email;
        await Accounts.sendEnrollmentEmail(userId, address);
      } catch (error) {
        // Allow another attempt after a failed SMTP delivery.
        await Meteor.users.updateAsync(userId, {
          $unset: { "services.password.enroll": 1 },
        });
        throw error;
      }
    },
  );
}
