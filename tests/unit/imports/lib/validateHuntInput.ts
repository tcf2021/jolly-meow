import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import type { EditableHuntType } from "../../../../imports/lib/models/Hunts";
import validateHuntInput from "../../../../imports/lib/validateHuntInput";

const base: EditableHuntType = {
  name: "小型活动",
  openSignups: false,
  hasGuessQueue: false,
  hasChat: false,
  hasHints: true,
};

describe("validateHuntInput", () => {
  it("accepts a bare domain with path and query, preserving feature choices", () => {
    const result = validateHuntInput({
      ...base,
      name: "  小型活动  ",
      homepageUrl: "  www.baidu.com/path?q=1#part  ",
    });
    assert.equal(result.homepageUrl, "https://www.baidu.com/path?q=1#part");
    assert.equal(result.name, "小型活动");
    assert.isFalse(result.hasChat);
    assert.isTrue(result.hasHints);
    assert.isFalse(result.hasGuessQueue);
  });

  it("preserves complete HTTP/HTTPS URLs and supports protocol-relative URLs", () => {
    for (const homepageUrl of [
      "http://localhost:13110/path",
      "https://example.com/path?q=1",
    ]) {
      assert.equal(
        validateHuntInput({ ...base, homepageUrl }).homepageUrl,
        homepageUrl,
      );
    }
    assert.equal(
      validateHuntInput({ ...base, homepageUrl: "//example.com/path" })
        .homepageUrl,
      "https://example.com/path",
    );
  });

  it("treats blank optional fields as absent without stripping Markdown", () => {
    const result = validateHuntInput({
      ...base,
      homepageUrl: "   ",
      googleGroup: " \t ",
      signupMessage: "    code block\n",
      termsOfUse: "\n ",
      submitTemplate: "\t",
    });
    assert.isUndefined(result.homepageUrl);
    assert.isUndefined(result.googleGroup);
    assert.isUndefined(result.termsOfUse);
    assert.isUndefined(result.submitTemplate);
    assert.equal(result.signupMessage, "    code block\n");
  });

  it("rejects empty or whitespace-only names with a Chinese client error", () => {
    for (const name of ["", " \t\n "]) {
      assert.throws(
        () => validateHuntInput({ ...base, name }),
        Meteor.Error,
        "请输入活动名称。",
      );
    }
  });

  it("rejects invalid URLs and unsupported protocols with a Chinese error", () => {
    for (const homepageUrl of [
      "bad url",
      "https://",
      "javascript:alert(1)",
      "ftp://example.com",
    ]) {
      assert.throws(
        () => validateHuntInput({ ...base, homepageUrl }),
        Meteor.Error,
        "官网地址无效",
      );
    }
  });

  it("validates trimmed Google group email addresses", () => {
    assert.equal(
      validateHuntInput({ ...base, googleGroup: "  team@example.com  " })
        .googleGroup,
      "team@example.com",
    );
    assert.throws(
      () => validateHuntInput({ ...base, googleGroup: "invalid-email" }),
      Meteor.Error,
      "Google 群组邮箱格式无效",
    );
  });

  it("converts other schema failures to Chinese client errors", () => {
    assert.throws(
      () =>
        validateHuntInput({
          ...base,
          memberDiscordRole: { id: "invalid", name: "队员" },
        }),
      Meteor.Error,
      "队员 Discord 身份组配置无效",
    );
  });
});
