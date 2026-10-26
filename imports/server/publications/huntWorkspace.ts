import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import HuntFolders from "../../lib/models/HuntFolders";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import huntWorkspace from "../../lib/publications/huntWorkspace";
import definePublication from "./definePublication";

definePublication(huntWorkspace, {
  validate(arg) {
    check(arg, { huntId: String });
    return arg;
  },
  async run({ huntId }) {
    if (!this.userId) return [];
    const user = await MeteorUsers.findOneAsync(this.userId);
    if (!user?.hunts?.includes(huntId) || !(await Hunts.findOneAsync(huntId)))
      return [];
    let stopped = false;
    const watches: Meteor.LiveQueryHandle[] = [];
    this.onStop(() => {
      stopped = true;
      watches.forEach((watch) => {
        watch.stop();
      });
    });
    const cursors: Mongo.Cursor<any>[] = [
      Hunts.find({ _id: huntId }),
      MeteorUsers.find({ _id: this.userId, hunts: huntId }),
    ];
    const revoke = () => {
      if (!stopped) this.error(new Meteor.Error(403, "你已无法访问此活动"));
    };
    for (const cursor of cursors) {
      let authorized = false;
      const watch = await cursor.observeChangesAsync({
        added() {
          authorized = true;
        },
        removed: revoke,
      });
      if (!authorized && !stopped)
        this.error(new Meteor.Error(403, "你已无法访问此活动"));
      if (stopped) {
        watch.stop();
        return undefined;
      }
      watches.push(watch);
    }
    return HuntFolders.find(
      { _id: huntId },
      {
        fields: {
          folder: 1,
          indexSpreadsheet: 1,
          indexUpdatedAt: 1,
          indexError: 1,
          memberAccessError: 1,
          memberAccessErrorCode: 1,
        },
      },
    );
  },
});
