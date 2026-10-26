import { Mongo } from "meteor/mongo";

export type HintStatus =
  | "sent"
  | "queued"
  | "answered"
  | "cancelled"
  | "autoClosed";

export type HintType = {
  _id: string;
  huntId: string;
  puzzleId: string;
  text: string;
  status: HintStatus;
  priority: boolean;
  response?: string;
  feedback?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  kind?: "new" | "followup";
  inReplyToHintId?: string;
  statusChangedAt?: Date;
};

const Hints = new Mongo.Collection<HintType>("jr_hints");

export default Hints;
