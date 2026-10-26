import { Accounts } from "meteor/accounts-base";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import sinon from "sinon";
import requestRegistration from "../../../../imports/server/requestRegistration";

describe("public email registration", function () {
  let email: string;
  let delivery: sinon.SinonStub;

  beforeEach(function () {
    email = `registration-${Random.id().toLowerCase()}@example.com`;
    delivery = sinon.stub(Accounts, "sendEnrollmentEmail").resolves();
  });

  afterEach(async function () {
    delivery.restore();
    const user = await Accounts.findUserByEmail(email);
    if (user) await Meteor.users.removeAsync(user._id);
  });

  it("creates an unverified account without hunt memberships or privileges", async function () {
    await requestRegistration(email);
    const user = await Accounts.findUserByEmail(email);
    assert.isOk(user);
    assert.isFalse(user?.emails?.[0]?.verified);
    assert.isNotOk(user?.services?.password?.bcrypt);
    assert.isEmpty(user?.hunts ?? []);
    assert.isEmpty(user?.roles ?? {});
    assert.isTrue(delivery.calledOnceWithExactly(user?._id, email));
  });

  it("reuses a pending account and preserves its invitations", async function () {
    const userId = await Accounts.createUserAsync({ email });
    await Meteor.users.updateAsync(userId, {
      $set: { displayName: "Invited teammate", hunts: [Random.id()] },
    });
    const before = await Meteor.users.findOneAsync(userId);
    await requestRegistration(email.toUpperCase());
    const after = await Meteor.users.findOneAsync(userId);
    assert.isTrue(delivery.calledOnceWithExactly(userId, email));
    assert.equal(after?.displayName, before?.displayName);
    assert.deepEqual(after?.hunts, before?.hunts);
    assert.equal(
      await Meteor.users.find({ "emails.address": email }).countAsync(),
      1,
    );
  });

  it("rejects an established password account without mailing or changing it", async function () {
    const userId = await Accounts.createUserAsync({
      email,
      password: Random.secret(),
    });
    const before = await Meteor.users.findOneAsync(userId);
    await assert.isRejected(
      requestRegistration(email),
      /already uses this email/,
    );
    assert.isTrue(delivery.notCalled);
    const after = await Meteor.users.findOneAsync(userId);
    assert.deepEqual(after?.services, before?.services);
  });

  it("rejects an established Google account", async function () {
    const userId = await Accounts.createUserAsync({ email });
    await Meteor.users.updateAsync(userId, {
      $set: { googleAccountId: Random.id() },
    });
    await assert.isRejected(
      requestRegistration(email),
      /already uses this email/,
    );
    assert.isTrue(delivery.notCalled);
  });

  it("does not resend a recent enrollment email", async function () {
    const userId = await Accounts.createUserAsync({ email });
    await Meteor.users.updateAsync(userId, {
      $set: {
        "services.password.enroll": {
          when: new Date(),
          token: Random.secret(),
        },
      },
    });
    await requestRegistration(email);
    assert.isTrue(delivery.notCalled);
  });

  it("allows delivery to be retried after an SMTP failure", async function () {
    delivery.callsFake(async (userId: string) => {
      await Meteor.users.updateAsync(userId, {
        $set: {
          "services.password.enroll": {
            when: new Date(),
            token: Random.secret(),
          },
        },
      });
      throw new Error("SMTP unavailable");
    });
    await assert.isRejected(requestRegistration(email), /SMTP unavailable/);
    const user = await Accounts.findUserByEmail(email);
    assert.isNotOk(user?.services?.password?.enroll);
    delivery.resolves();
    await requestRegistration(email);
    assert.equal(delivery.callCount, 2);
  });
});
