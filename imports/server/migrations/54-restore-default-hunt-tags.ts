import { DEFAULT_HUNT_TAGS } from "../../lib/defaultHuntTags";
import Hunts from "../../lib/models/Hunts";
import getOrCreateTagByName from "../getOrCreateTagByName";
import Migrations from "./Migrations";

Migrations.add({
  version: 54,
  name: "Restore default tags removed by the legacy hunt-content purge",
  async up() {
    for await (const hunt of Hunts.find()) {
      for (const name of DEFAULT_HUNT_TAGS) {
        await getOrCreateTagByName(hunt._id, name, hunt.createdBy);
      }
    }
  },
});
