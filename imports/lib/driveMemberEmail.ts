import type { Meteor } from "meteor/meteor";

// Registration email can differ from the Google identity used for Drive.
export default function driveMemberEmail(
  user: Pick<Meteor.User, "googleAccount" | "emails">,
) {
  return user.googleAccount?.toLowerCase();
}
