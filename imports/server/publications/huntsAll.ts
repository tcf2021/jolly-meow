import isAdmin from "../../lib/isAdmin";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import huntsAll from "../../lib/publications/huntsAll";
import publishJoinedQuery from "../publishJoinedQuery";
import definePublication from "./definePublication";

definePublication(huntsAll, {
  async run() {
    if (!this.userId) {
      return [];
    }

    const user = await MeteorUsers.findOneAsync(this.userId);
    if (isAdmin(user)) return Hunts.find();

    await publishJoinedQuery(
      this,
      {
        model: MeteorUsers,
        projection: { hunts: 1 },
        foreignKeys: [{ field: "hunts", join: { model: Hunts } }],
      },
      { _id: this.userId },
    );
    this.ready();
    return undefined;
  },
});
