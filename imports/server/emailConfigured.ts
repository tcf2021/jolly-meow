import { Email } from "meteor/email";
import { Meteor } from "meteor/meteor";

export default function emailConfigured() {
  return (
    !Meteor.isProduction ||
    !!process.env.MAIL_URL ||
    !!Meteor.settings.packages?.email ||
    !!Email.customTransport
  );
}
