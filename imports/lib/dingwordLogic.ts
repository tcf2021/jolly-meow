import type { Meteor } from "meteor/meteor";
import type { ChatMessageType } from "./models/ChatMessages";
import nodeIsDingword from "./nodeIsDingword";
import nodeIsMention from "./nodeIsMention";
import nodeIsRoleMention from "./nodeIsRoleMention";
import nodeIsText from "./nodeIsText";
import { listAllRolesForHunt } from "./permission_stubs";

type NeededChatFields = "content" | "sender" | "hunt";
type PartialChatMessageType = Pick<ChatMessageType, NeededChatFields>;

export function normalizedForDingwordSearch(
  chatMessage: PartialChatMessageType,
): string {
  return (
    chatMessage.content?.children
      .map((child) => {
        if (nodeIsText(child)) {
          return child.text;
        } else {
          // No need to look for dingwords in @-mentions, but let them split words
          return " ";
        }
      })
      .join("")
      .trim()
      .toLowerCase() ?? ""
  );
}

export function messageDingsUser(
  chatMessage: PartialChatMessageType,
  user: Meteor.User,
): boolean {
  if (chatMessage.sender === user._id || chatMessage.sender === undefined) {
    // You can never be dinged by yourself, nor by system messages.
    return false;
  }

  const dingedByDingwords = (chatMessage.content?.children ?? []).some(
    (child) => {
      if (nodeIsDingword(child)) {
        return user.dingwords?.includes(child.dingwordId);
      } else {
        return false;
      }
    },
  );

  const dingedByMentions = (chatMessage.content?.children ?? []).some(
    (child) => {
      if (nodeIsMention(child)) {
        return child.userId === user._id;
      } else {
        return false;
      }
    },
  );
  const roles = listAllRolesForHunt(user, { _id: chatMessage.hunt });
  const dingedByRoleMentions = (chatMessage.content?.children ?? []).some(
    (child) => {
      if (nodeIsRoleMention(child)) {
        return roles.includes(child.roleId);
      } else {
        return false;
      }
    },
  );
  return dingedByDingwords || dingedByMentions || dingedByRoleMentions;
}
