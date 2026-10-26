import { z } from "zod";
import { foreignKey } from "./customTypes";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

const HintRequestNotification = withCommon(
  z.object({
    user: foreignKey,
    hunt: foreignKey,
    puzzle: foreignKey,
    hint: foreignKey,
    requestedBy: foreignKey,
    requestedAt: z.date(),
    kind: z.enum(["new", "updated"]).optional(),
  }),
);

const HintRequestNotifications = new SoftDeletedModel(
  "jr_hint_request_notifications",
  HintRequestNotification,
);

HintRequestNotifications.addIndex({ user: 1, hint: 1 }, { unique: true });
HintRequestNotifications.addIndex({ user: 1, requestedAt: 1 });

export type HintRequestNotificationType = ModelType<
  typeof HintRequestNotifications
>;

export default HintRequestNotifications;
