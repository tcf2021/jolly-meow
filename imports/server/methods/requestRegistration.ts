import { check } from "meteor/check";
import { DDPRateLimiter } from "meteor/ddp-rate-limiter";
import { Meteor } from "meteor/meteor";
import { z } from "zod";
import requestRegistrationMethod from "../../methods/requestRegistration";
import requestRegistration from "../requestRegistration";
import defineMethod from "./defineMethod";

defineMethod(requestRegistrationMethod, {
  validate(arg) {
    check(arg, { email: String });
    const result = z.string().trim().max(254).email().safeParse(arg.email);
    if (!result.success) throw new Meteor.Error(400, "Invalid email address");
    return { email: result.data };
  },
  async run({ email }) {
    await requestRegistration(email);
  },
});

DDPRateLimiter.addRule(
  {
    type: "method",
    name: requestRegistrationMethod.name,
    clientAddress: () => true,
  },
  5,
  60_000,
);
