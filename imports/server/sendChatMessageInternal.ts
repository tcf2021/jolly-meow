import { Meteor } from "meteor/meteor";
import type { ChatMessageContentType } from "../lib/models/ChatMessages";
import ChatMessages from "../lib/models/ChatMessages";
import Puzzles from "../lib/models/Puzzles";
import GlobalHooks from "./GlobalHooks";
import { assertHuntWritable } from "./huntArchive";

export default async function sendChatMessageInternal({
  puzzleId,
  content,
  sender,
  parentId = null,
}: {
  puzzleId: string;
  content: ChatMessageContentType;
  sender: string | undefined;
  parentId: string | null;
}) {
  const puzzle = await Puzzles.findOneAsync(puzzleId);
  if (!puzzle) {
    throw new Meteor.Error(404, "Unknown puzzle");
  }
  await assertHuntWritable(puzzle.hunt);

  const msgId = await ChatMessages.insertAsync({
    puzzle: puzzleId,
    hunt: puzzle.hunt,
    content,
    sender,
    timestamp: new Date(),
    pinTs: null,
    parentId,
  });

  await GlobalHooks.runChatMessageCreatedHooks(msgId);
}
