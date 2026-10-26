import { Meteor } from "meteor/meteor";
import type { EditableHuntType } from "./models/Hunts";
import { EditableHunt } from "./models/Hunts";

const homepageError = "官网地址无效，请填写网址，例如 https://www.baidu.com。";

const fieldErrors: Record<string, string> = {
  name: "请输入活动名称。",
  homepageUrl: homepageError,
  googleGroup: "Google 群组邮箱格式无效，请填写完整邮箱地址。",
  mailingLists: "邮件列表格式无效，请检查填写内容。",
  signupMessage: "加入说明格式无效。",
  termsOfUse: "活动规则格式无效。",
  submitTemplate: "答案提交网址模板格式无效。",
  puzzleHooksDiscordChannel: "题目通知 Discord 频道配置无效。",
  firehoseDiscordChannel: "聊天同步 Discord 频道配置无效。",
  memberDiscordRole: "队员 Discord 身份组配置无效。",
};

function optionalText(value: string | undefined) {
  return value?.trim() ? value : undefined;
}

export default function validateHuntInput(value: EditableHuntType) {
  let homepageUrl = optionalText(value.homepageUrl?.trim());
  if (homepageUrl?.startsWith("//")) {
    homepageUrl = `https:${homepageUrl}`;
  } else if (
    homepageUrl &&
    /^(?:localhost|[^\s/:?#@]+(?:\.[^\s/:?#@]+)+)(?::\d+)?(?:[/?#]|$)/i.test(
      homepageUrl,
    )
  ) {
    homepageUrl = `https://${homepageUrl}`;
  }
  if (homepageUrl && !/^https?:\/\//i.test(homepageUrl)) {
    throw new Meteor.Error(400, homepageError);
  }

  const result = EditableHunt.safeParse({
    ...value,
    name: value.name.trim(),
    homepageUrl,
    googleGroup: optionalText(value.googleGroup?.trim()),
    signupMessage: optionalText(value.signupMessage),
    termsOfUse: optionalText(value.termsOfUse),
    submitTemplate: optionalText(value.submitTemplate),
  });
  if (!result.success) {
    const field = String(result.error.issues[0]?.path[0] ?? "");
    throw new Meteor.Error(
      400,
      fieldErrors[field] ?? "活动设置格式无效，请检查填写内容。",
    );
  }
  return result.data;
}
