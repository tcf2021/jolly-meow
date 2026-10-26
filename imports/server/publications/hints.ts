import { check } from "meteor/check";
import { Meteor } from "meteor/meteor";
import Hints from "../../lib/models/Hints";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";

async function canReadHints(userId: string, huntId: string) {
  const user = await MeteorUsers.findOneAsync(userId);
  const hunt = await Hunts.findOneAsync(huntId);
  return Boolean(
    hunt && hunt.hasHints !== false && user?.hunts?.includes(huntId),
  );
}

/**
 * 某个谜题下的所有提示
 */
Meteor.publish(
  "hintsForPuzzle",
  async function (params: { huntId: string; puzzleId: string }) {
    check(params, {
      huntId: String,
      puzzleId: String,
    });

    if (!this.userId) {
      return this.ready();
    }

    const { huntId, puzzleId } = params;
    if (!(await canReadHints(this.userId, huntId))) return [];

    return Hints.find(
      { huntId, puzzleId },
      {
        sort: { createdAt: 1 },
      },
    );
  },
);

/**
 * 某个 hunt 下的提示历史（比如“我的提示记录”页面）
 */
Meteor.publish("hintsForHunt", async function (params: { huntId: string }) {
  check(params, {
    huntId: String,
  });

  if (!this.userId) {
    return this.ready();
  }

  const { huntId } = params;
  if (!(await canReadHints(this.userId, huntId))) return [];

  return Hints.find(
    { huntId },
    {
      sort: { createdAt: 1 },
    },
  );
});

Meteor.publish(
  "hintsForHintQueue",
  async function (params: { huntId: string }) {
    check(params, {
      huntId: String,
    });

    if (!this.userId) {
      return this.ready();
    }

    const { huntId } = params;
    if (!(await canReadHints(this.userId, huntId))) return [];

    return Hints.find(
      { huntId },
      {
        sort: { priority: -1, createdAt: 1 },
      },
    );
  },
);
