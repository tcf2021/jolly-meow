import HintAnswerNotifications from "../../lib/models/HintAnswerNotifications";
import Hunts from "../../lib/models/Hunts";
import Puzzles from "../../lib/models/Puzzles";
import hintAnswerNotificationsForSelf from "../../lib/publications/hintAnswerNotificationsForSelf";
import publishJoinedQuery from "../publishJoinedQuery";
import definePublication from "./definePublication";

definePublication(hintAnswerNotificationsForSelf, {
  async run() {
    if (!this.userId) {
      return [];
    }

    await publishJoinedQuery(
      this,
      {
        model: HintAnswerNotifications,
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
