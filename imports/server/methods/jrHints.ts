import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { z } from "zod";
import type { HintType } from "../../lib/models/Hints";
import Hints from "../../lib/models/Hints";
import type { HuntType } from "../../lib/models/Hunts";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import Puzzles from "../../lib/models/Puzzles";
import type { User as UserSchema } from "../../lib/models/User";
import { userMayUpdateGuessesForHunt } from "../../lib/permission_stubs";
import type {
  CancelHintArgs,
  DeleteHintArgs,
  SetPriorityArgs,
  SubmitHintArgs,
  UpdateFieldArgs,
} from "../../methods/jrHints";
import {
  cancelHint,
  deleteHint,
  setHintPriority,
  submitHint,
  updateHintField,
} from "../../methods/jrHints";
import fanoutHintAnswerNotifications from "../fanoutHintAnswerNotifications";
import fanoutHintRequestNotifications from "../fanoutHintRequestNotifications";
import defineMethod from "./defineMethod";

/**
 * 找到当前用户在某题上最新一条队列中的提示
 */
function findLatestPendingHint(
  userId: string,
  huntId: string,
  puzzleId: string,
) {
  return Hints.findOneAsync(
    {
      huntId,
      puzzleId,
      createdBy: userId,
      status: { $in: ["sent", "queued"] },
    },
    { sort: { createdAt: -1 } },
  );
}

/**
 * 要求当前必须登录，并返回用户对象
 */
type DbUser = z.infer<typeof UserSchema>;

type UserWithAccessFields = DbUser & {
  roles: Record<string, string[]> | undefined;
  hunts: string[] | undefined;
};

async function requireUser(
  this: Meteor.MethodThisType,
): Promise<UserWithAccessFields> {
  if (!this.userId) {
    throw new Meteor.Error(401, "请先登录");
  }
  const user = (await MeteorUsers.findOneAsync(this.userId)) as
    | DbUser
    | undefined;
  if (!user) {
    throw new Meteor.Error(401, "用户不存在");
  }
  return {
    ...user,
    roles: user.roles,
    hunts: user.hunts,
  } satisfies UserWithAccessFields;
}

type HintAccessContext = {
  hunt: Pick<HuntType, "_id">;
  isMember: boolean;
  canManageStatus: boolean;
};

async function ensureUserCanActOnHint(
  user: UserWithAccessFields,
  hint: Pick<HintType, "huntId">,
): Promise<HintAccessContext> {
  const hunt = await Hunts.findOneAsync({ _id: hint.huntId });

  if (!hunt) {
    throw new Meteor.Error("not-found", "所属活动不存在");
  }
  if (hunt.hasHints === false)
    throw new Meteor.Error(403, "此活动未启用提示功能");

  const isMember = Boolean(user.hunts?.includes(hint.huntId));
  const canManageStatus = userMayUpdateGuessesForHunt(user, hunt);

  if (!isMember && !canManageStatus) {
    throw new Meteor.Error("not-authorized", "你没有权限执行此操作");
  }

  return { hunt, isMember, canManageStatus };
}

// -----------------------
// jrHints.submit
// -----------------------
defineMethod(submitHint, {
  validate(this: Meteor.MethodThisType, arg: unknown): SubmitHintArgs {
    check(arg, {
      huntId: String,
      puzzleId: String,
      text: String,
      mode: Match.OneOf("new", "cancel"),
    });
    return arg as SubmitHintArgs;
  },

  async run(
    this: Meteor.MethodThisType,
    { huntId, puzzleId, text, mode }: SubmitHintArgs,
  ) {
    const user = await requireUser.call(this);
    const userId = user._id;
    await ensureUserCanActOnHint(user, { huntId });
    if (!(await Puzzles.findOneAsync({ _id: puzzleId, hunt: huntId }))) {
      throw new Meteor.Error(404, "题目不存在");
    }

    if (mode === "cancel") {
      const latest = await findLatestPendingHint(userId, huntId, puzzleId);
      if (!latest) {
        throw new Meteor.Error("no-queued-hint", "当前没有排队提示可撤销");
      }

      if (latest.status !== "queued" && latest.status !== "sent") {
        throw new Meteor.Error(
          "not-cancelable",
          "只能撤销队列中或已提交的提示",
        );
      }

      await Hints.updateAsync(latest._id, {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
          statusChangedAt: new Date(),
        },
      });
      return latest._id;
    }

    // new：不允许同一题上同时存在多条队列中的提示
    const existing = await findLatestPendingHint(userId, huntId, puzzleId);
    if (existing) {
      throw new Meteor.Error("hint-already-queued", "该题已存在排队提示");
    }

    const now = new Date();
    const hintId = await Hints.insertAsync({
      huntId,
      puzzleId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      text,
      status: "queued",
      statusChangedAt: now,
      priority: false,
      kind: "new",
    } as any);

    await fanoutHintRequestNotifications({
      hintId,
      huntId,
      puzzleId,
      requestedAt: now,
      requestedBy: userId,
      kind: "new",
    });

    return hintId;
  },
});

// -----------------------
// jrHints.updateField
// -----------------------
defineMethod(updateHintField, {
  validate(this: Meteor.MethodThisType, arg: unknown): UpdateFieldArgs {
    check(arg, {
      hintId: String,
      field: String,
      value: Match.Any,
    });
    return arg as UpdateFieldArgs;
  },

  async run(
    this: Meteor.MethodThisType,
    { hintId, field, value }: UpdateFieldArgs,
  ) {
    const user = await requireUser.call(this);
    const userId = user._id;

    const allowed = [
      "text",
      "response",
      "feedback",
      "status",
      "priority",
    ] as const;

    if (!allowed.includes(field)) {
      throw new Meteor.Error("invalid-field", `字段 ${field} 不允许编辑`);
    }

    const hint = await Hints.findOneAsync(hintId);
    if (!hint) {
      throw new Meteor.Error("not-found", "提示不存在");
    }

    const { canManageStatus } = await ensureUserCanActOnHint(user, hint);
    if (field === "status" && !canManageStatus) {
      throw new Meteor.Error("not-authorized", "只有工作人员可以更新提示状态");
    }

    const now = new Date();
    const update: Record<string, unknown> = {
      [field]: value,
      updatedAt: now,
    };
    let statusChangedAt: Date | undefined;

    if (field === "status") {
      statusChangedAt = new Date();
      update.statusChangedAt = statusChangedAt;
    }

    await Hints.updateAsync(hintId, {
      $set: update,
    });

    const shouldNotifyAboutEdit =
      field === "text" && hint.status === "queued" && hint.createdBy === userId;

    if (shouldNotifyAboutEdit) {
      await fanoutHintRequestNotifications({
        hintId,
        huntId: hint.huntId,
        puzzleId: hint.puzzleId,
        requestedAt: now,
        requestedBy: userId,
        kind: "updated",
      });
    }

    if (
      field === "status" &&
      value === "answered" &&
      hint.status !== "answered" &&
      statusChangedAt
    ) {
      await fanoutHintAnswerNotifications({
        hintId,
        huntId: hint.huntId,
        puzzleId: hint.puzzleId,
        answeredAt: statusChangedAt,
      });
    }
  },
});

// -----------------------
// jrHints.setPriority
// -----------------------
defineMethod(setHintPriority, {
  validate(this: Meteor.MethodThisType, arg: unknown): SetPriorityArgs {
    check(arg, {
      hintId: String,
      priority: Boolean,
    });
    return arg as SetPriorityArgs;
  },

  async run(
    this: Meteor.MethodThisType,
    { hintId, priority }: SetPriorityArgs,
  ) {
    await requireUser.call(this);

    await Hints.updateAsync(hintId, {
      $set: { priority, updatedAt: new Date() },
    });
  },
});

// -----------------------
// jrHints.cancel（任何 hunt 成员可撤销排队提示）
// -----------------------
defineMethod(cancelHint, {
  validate(this: Meteor.MethodThisType, arg: unknown): CancelHintArgs {
    check(arg, { hintId: String });
    return arg as CancelHintArgs;
  },

  async run(this: Meteor.MethodThisType, { hintId }: CancelHintArgs) {
    const user = await requireUser.call(this);
    const hint = await Hints.findOneAsync(hintId);

    if (!hint) throw new Meteor.Error("not-found");
    await ensureUserCanActOnHint(user, hint);
    if (hint.status !== "queued" && hint.status !== "sent") {
      throw new Meteor.Error("not-cancelable", "只能撤销队列中或已提交的提示");
    }

    await Hints.updateAsync(hintId, {
      $set: {
        status: "cancelled",
        updatedAt: new Date(),
        statusChangedAt: new Date(),
      },
    });
  },
});

// -----------------------
// jrHints.delete（仅限管理人员）
// -----------------------
defineMethod(deleteHint, {
  validate(this: Meteor.MethodThisType, arg: unknown): DeleteHintArgs {
    check(arg, { hintId: String });
    return arg as DeleteHintArgs;
  },

  async run(this: Meteor.MethodThisType, { hintId }: DeleteHintArgs) {
    const user = await requireUser.call(this);
    const hint = await Hints.findOneAsync(hintId);
    if (!hint) {
      throw new Meteor.Error("not-found", "提示不存在");
    }

    const hunt = await Hunts.findOneAsync(
      { _id: hint.huntId },
      { fields: { _id: 1 } },
    );
    if (!userMayUpdateGuessesForHunt(user, hunt)) {
      throw new Meteor.Error("not-authorized", "你没有权限执行此操作");
    }

    if (hint.status !== "cancelled" && hint.status !== "autoClosed") {
      throw new Meteor.Error(
        "invalid-status",
        "你只能删除已撤销或自动关闭的提示",
      );
    }

    await Hints.removeAsync(hintId);
  },
});
