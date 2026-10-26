import { check } from "meteor/check";
import Dingwords from "../../lib/models/Dingwords";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { checkAdmin } from "../../lib/permission_stubs";
import updateDingwords from "../../methods/updateDingwords";
import ensureDingwordRoot from "../ensureDingwordRoot";
import defineMethod from "./defineMethod";

defineMethod(updateDingwords, {
  validate(arg) {
    check(arg, {
      changedDingwords: [
        {
          _id: String,
          name: String,
          children: [String],
          selectable: Boolean,
        },
      ],
      deletedDingwordIds: [String],
    });

    return arg;
  },

  async run({ changedDingwords, deletedDingwordIds }) {
    check(this.userId, String);
    checkAdmin(await MeteorUsers.findOneAsync(this.userId));
    const rootId = await ensureDingwordRoot(this.userId);

    for (const dw of changedDingwords) {
      // initial run with root, create a pseudo node for root
      if (dw._id === "__root__") {
        await Dingwords.updateAsync(
          {
            _id: rootId,
          },
          {
            $set: {
              children: [...new Set(dw.children)],
              selectable: false,
            },
          },
        );
      } else {
        if (!(await Dingwords.findOneAsync(dw._id))) {
          await Dingwords.insertAsync({ ...dw, createdBy: this.userId });
          continue;
        }
        await Dingwords.updateAsync(
          {
            _id: dw._id,
          },
          {
            $set: {
              name: dw.name,
              children: [...new Set(dw.children)],
              selectable: dw.selectable,
            },
          },
        );
      }
    }

    for (const dwId of deletedDingwordIds) {
      if (dwId === rootId) continue;
      await Dingwords.destroyAsync(dwId);
    }
    await ensureDingwordRoot(this.userId);
  },
});
