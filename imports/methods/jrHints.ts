import type { HintType } from "../lib/models/Hints";
import type { TypedMethodParam } from "./TypedMethod";
import TypedMethod from "./TypedMethod";

export type SubmitHintArgs = {
  huntId: string;
  puzzleId: string;
  text: string;
  mode: "new" | "cancel";
} & Record<string, TypedMethodParam>;

export const submitHint = new TypedMethod<SubmitHintArgs, string>(
  "jrHints.submit",
);

export type UpdateFieldArgs = {
  hintId: string;
  field: keyof Pick<
    HintType,
    "text" | "response" | "feedback" | "status" | "priority"
  >;
  value: TypedMethodParam;
} & Record<string, TypedMethodParam>;

export const updateHintField = new TypedMethod<UpdateFieldArgs, void>(
  "jrHints.updateField",
);

export type SetPriorityArgs = {
  hintId: string;
  priority: boolean;
} & Record<string, TypedMethodParam>;

export const setHintPriority = new TypedMethod<SetPriorityArgs, void>(
  "jrHints.setPriority",
);

export type CancelHintArgs = {
  hintId: string;
} & Record<string, TypedMethodParam>;

export const cancelHint = new TypedMethod<CancelHintArgs, void>(
  "jrHints.cancel",
);

export type DeleteHintArgs = {
  hintId: string;
} & Record<string, TypedMethodParam>;

export const deleteHint = new TypedMethod<DeleteHintArgs, void>(
  "jrHints.delete",
);
