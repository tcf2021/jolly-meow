import { Meteor } from "meteor/meteor";
import { z } from "zod";

export const WhiteboardSceneSchema = z.object({
  elements: z
    .array(
      z
        .object({
          id: z.string().min(1).max(200),
          version: z.number().int().nonnegative(),
          versionNonce: z.number().int(),
        })
        .passthrough(),
    )
    .max(10000),
  files: z.record(z.unknown()),
});
export const WhiteboardPresenceSchema = z.object({
  pointer: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      tool: z.enum(["pointer", "laser"]),
    })
    .optional(),
  button: z.enum(["up", "down"]),
  selectedElementIds: z
    .record(z.literal(true))
    .refine((ids) => Object.keys(ids).length <= 10000),
});
export function parseWhiteboardScene(scene: string) {
  if (scene.length > 6 * 1024 * 1024)
    throw new Meteor.Error(413, "白板内容过大，请减少图片或图形");
  try {
    return WhiteboardSceneSchema.parse(JSON.parse(scene));
  } catch {
    throw new Meteor.Error(400, "白板数据格式不正确");
  }
}
