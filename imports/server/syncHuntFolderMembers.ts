import { Meteor } from "meteor/meteor";
import Flags from "../Flags";
import driveMemberEmail from "../lib/driveMemberEmail";
import FolderPermissions from "../lib/models/FolderPermissions";
import HuntFolders from "../lib/models/HuntFolders";
import MeteorUsers from "../lib/models/MeteorUsers";
import { ensureHuntFolderPermission } from "./gdrive";
import GoogleClient from "./googleClientRefresher";
import withLock from "./withLock";

export default async function syncHuntFolderMembers(
  huntId: string,
  folder: string,
) {
  if (await Flags.activeAsync("disable.gdrive_permissions")) {
    await HuntFolders.updateAsync(huntId, {
      $set: {
        memberAccessError:
          "成员 Drive 自动授权未开启，请在服务器设置中启用「Google Drive 身份共享权限」。",
        memberAccessErrorCode: "disabled",
      },
    });
    return false;
  }
  const members = await MeteorUsers.find({ hunts: huntId }).fetchAsync();
  const allowed = new Set(
    members.map(driveMemberEmail).filter((email): email is string => !!email),
  );
  // Invitations create a user record before the recipient has enrolled.
  // They cannot bind Google yet and must not produce a warning for active members.
  const missingAccount = members.some(
    (member) =>
      !driveMemberEmail(member) &&
      !(
        member.services?.password?.enroll &&
        !member.services?.password?.bcrypt &&
        !member.services?.resume?.loginTokens?.length &&
        !member.displayName
      ),
  );
  let failed = false;
  let retry = false;
  const onError = (error: unknown) => {
    failed = true;
    const code =
      error && typeof error === "object" && "code" in error
        ? Number(error.code)
        : 0;
    if (code !== 400 && code !== 403) retry = true;
  };
  for (const member of members) {
    const email = driveMemberEmail(member);
    if (!email) continue;
    try {
      await ensureHuntFolderPermission(huntId, member._id, email);
    } catch (error) {
      onError(error);
    }
  }
  // Revoke only permissions created by the app, or restore a previous manual role.
  await withLock(`folder:${folder}:permissions`, async (renew) => {
    const heartbeat = Meteor.setInterval(() => {
      void renew().catch(() => undefined);
    }, 3000);
    try {
      const client = GoogleClient.drive;
      if (!client) return;
      const permissions = await FolderPermissions.find({
        folder,
        permissionLevel: "writer",
      }).fetchAsync();
      for (const permission of permissions) {
        if (allowed.has(permission.googleAccount.toLowerCase())) continue;
        try {
          await renew();
          if (permission.permissionId) {
            if (permission.previousRole)
              await client.permissions.update({
                fileId: folder,
                permissionId: permission.permissionId,
                requestBody: { role: permission.previousRole },
              });
            else
              await client.permissions.delete({
                fileId: folder,
                permissionId: permission.permissionId,
              });
          }
          await FolderPermissions.destroyAsync(permission._id);
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? Number(error.code)
              : 0;
          if (code === 404)
            await FolderPermissions.destroyAsync(permission._id);
          else onError(error);
        }
      }
    } finally {
      Meteor.clearInterval(heartbeat);
    }
  });
  await HuntFolders.updateAsync(
    huntId,
    failed || missingAccount
      ? {
          $set: {
            memberAccessError: missingAccount
              ? "部分已注册队员尚未绑定 Google 账号，请在个人资料中绑定。"
              : "Drive 权限同步失败，请检查管理账号授权和活动文件夹共享权限。",
            memberAccessErrorCode: missingAccount
              ? failed
                ? "mixed"
                : "unbound"
              : "failed",
          },
        }
      : { $unset: { memberAccessError: 1, memberAccessErrorCode: 1 } },
  );
  return retry;
}
