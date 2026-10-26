import HintRequestNotifications from "../../lib/models/HintRequestNotifications";
import Hunts from "../../lib/models/Hunts";
import Puzzles from "../../lib/models/Puzzles";
import hintRequestNotificationsForOperator from "../../lib/publications/hintRequestNotificationsForOperator";
import publishJoinedQuery from "../publishJoinedQuery";
import definePublication from "./definePublication";

definePublication(hintRequestNotificationsForOperator, {
  async run() {
    if (!this.userId) {
      return [];
    }

    await publishJoinedQuery(
      this,
      {
        model: HintRequestNotifications,
        foreignKeys: [
          {
            field: "puzzle",
            join: { model: Puzzles, allowDeleted: true },
          },
          {
            field: "hunt",
            join: { model: Hunts },
          },
        ],
      },
      { user: this.userId },
    );

    this.ready();
    return undefined;
  },
});
