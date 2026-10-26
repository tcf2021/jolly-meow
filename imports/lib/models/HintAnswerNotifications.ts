import { z } from "zod";
import { foreignKey } from "./customTypes";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

const HintAnswerNotification = withCommon(
  z.object({
    user: foreignKey,
    hunt: foreignKey,
    puzzle: foreignKey,
    hint: foreignKey,
    answeredAt: z.date(),
  }),
);

const HintAnswerNotifications = new SoftDeletedModel(
  "jr_hint_answer_notifications",
  HintAnswerNotification,
);
HintAnswerNotifications.addIndex({ user: 1, hint: 1 }, { unique: true });
HintAnswerNotifications.addIndex({ user: 1, answeredAt: 1 });
export type HintAnswerNotificationType = ModelType<
  typeof HintAnswerNotifications
>;

export default HintAnswerNotifications;
