import { check } from "meteor/check";
import isAdmin from "../../lib/isAdmin";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import huntForHuntApp from "../../lib/publications/huntForHuntApp";
import publishJoinedQuery from "../publishJoinedQuery";
import definePublication from "./definePublication";

definePublication(huntForHuntApp, {
  validate(arg) {
    check(arg, {
      huntId: String,
    });
    return arg;
  },

  async run({ huntId }) {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (isAdmin(user)) return Hunts.findAllowingDeleted({ _id: huntId });
    await publishJoinedQuery(
      this,
      {
        model: MeteorUsers,
        projection: { hunts: 1 },
        foreignKeys: [
          { field: "hunts", join: { model: Hunts, allowDeleted: true } },
        ],
      },
      { _id: this.userId, hunts: huntId },
    );
    this.ready();
    return undefined;
  },
});
