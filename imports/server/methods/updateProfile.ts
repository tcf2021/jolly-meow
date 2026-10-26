import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Logger from "../../Logger";
import Dingwords from "../../lib/models/Dingwords";
import MeteorUsers from "../../lib/models/MeteorUsers";
import updateProfile from "../../methods/updateProfile";
import ensureDingwordRoot from "../ensureDingwordRoot";
import getOrCreateDingwordByName from "../getOrCreateDingwordByName";
import defineMethod from "./defineMethod";

defineMethod(updateProfile, {
  validate(arg) {
    check(arg, {
      displayName: String,
      dingwords: [String],
      addedDingwords: [
        {
          newDingword: String,
          parentId: String,
          clientId: Match.Optional(String),
        },
      ],
      enrollmentToken: Match.Optional(String),
    });

    return arg;
  },

  async run({ displayName, dingwords, addedDingwords, enrollmentToken }) {
    let userId: string;
    if (enrollmentToken) {
      // enrollmentToken is only for the unauthenticated enrollment path.
      // A logged-in user must not be able to use a token to target a
      // different user's profile.
      if (this.userId) {
        throw new Meteor.Error(
          400,
          "Cannot use enrollment token while logged in",
        );
      }

      // Look up the user by their enrollment token. This supports calling
      // updateProfile before Accounts.resetPassword consumes the token,
      // making enrollment resilient to method retries on connection drops.
      const user = await MeteorUsers.findOneAsync(
        { "services.password.enroll.token": enrollmentToken },
        { fields: { _id: 1 } },
      );
      if (!user) {
        throw new Meteor.Error(403, "Token expired");
      }
      userId = user._id;
    } else {
      check(this.userId, String);
      userId = this.userId;
    }

    if (!displayName || displayName.match(/^\s/)) {
      throw new Meteor.Error(
        400,
        "Display name is required and cannot begin with whitespace",
      );
    }

    const selectedNames = dingwords.map((name) => name.trim());
    const allNames = [
      ...new Set([
        ...selectedNames,
        ...addedDingwords.map((word) => word.newDingword.trim()),
      ]),
    ];
    if (allNames.some((name) => !name || name === "__root__"))
      throw new Meteor.Error(400, "Keyword name must not be empty or reserved");
    const rootId =
      allNames.length > 0 ? await ensureDingwordRoot(userId) : undefined;
    const entries = await Promise.all(
      allNames.map(async (dingword) => {
        const id = await getOrCreateDingwordByName(dingword, userId);
        return [dingword, id] as const;
      }),
    );

    const dingwordToId = new Map(entries);
    const clientIds = new Map(
      addedDingwords
        .filter((word) => word.clientId)
        .map((word) => [
          word.clientId!,
          dingwordToId.get(word.newDingword.trim())!,
        ]),
    );
    for (const { newDingword, parentId } of addedDingwords) {
      const newId = dingwordToId.get(newDingword.trim());
      if (!newId) continue;
      const storedParent =
        parentId === "__root__"
          ? rootId
          : (clientIds.get(parentId) ?? parentId);
      if (
        !storedParent ||
        storedParent === newId ||
        !(await Dingwords.findOneAsync(storedParent))
      )
        throw new Meteor.Error(400, "Invalid keyword parent");
      await Dingwords.updateAsync(
        {
          _id: storedParent,
        },
        { $addToSet: { children: newId } },
      );
    }
    if (rootId) await ensureDingwordRoot(userId);

    Logger.info("Updating profile for user", { displayName });
    await MeteorUsers.updateAsync(userId, {
      $set: {
        displayName,
        dingwords: [
          ...new Set(selectedNames.map((name) => dingwordToId.get(name)!)),
        ],
      },
    });
  },
});
