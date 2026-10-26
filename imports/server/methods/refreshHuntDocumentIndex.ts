import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import refreshHuntDocumentIndex from "../../methods/refreshHuntDocumentIndex";
import { scheduleHuntDocumentIndex } from "../automaticHuntDocumentIndex";
import {
  recordHuntIndexError,
  syncHuntDocumentIndex,
} from "../huntDocumentIndex";
import defineMethod from "./defineMethod";

defineMethod(refreshHuntDocumentIndex, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },
  async run({ huntId }) {
    check(this.userId, String);
    const hunt = await Hunts.findOneAsync(huntId);
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (
      !hunt ||
      !user?.hunts?.includes(huntId) ||
      !userMayWritePuzzlesForHunt(user, hunt)
    )
      throw new Meteor.Error(403, "只有本活动的管理员可以刷新总表");
    this.unblock();
    let synced: boolean;
    try {
      synced = await syncHuntDocumentIndex(huntId, true);
    } catch {
      await recordHuntIndexError(huntId).catch(() => undefined);
      scheduleHuntDocumentIndex(huntId, 5000);
      throw new Meteor.Error(
        503,
        "总表同步失败，请检查 Google 授权和活动文件夹权限",
      );
    }
    if (!synced)
      throw new Meteor.Error(
        503,
        "尚未启用 Google Drive：请在系统设置中配置 Google OAuth 并授权 Drive 管理账号",
      );
  },
});
