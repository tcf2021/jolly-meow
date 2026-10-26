import type {
  ChatMessageContentNodeType,
  ChatMessageDingwordNodeType,
} from "./models/ChatMessages";

export default function nodeIsDingword(
  node: ChatMessageContentNodeType,
): node is ChatMessageDingwordNodeType {
  return "type" in node && node.type === "dingword";
}
