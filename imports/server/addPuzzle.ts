import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import Flags from "../Flags";
import Logger from "../Logger";
import createPuzzleWorkspace from "../lib/jobs/createPuzzleWorkspace";
import { IsInsert } from "../lib/models/customTypes";
import Hunts from "../lib/models/Hunts";
import MeteorUsers from "../lib/models/MeteorUsers";
import Puzzles from "../lib/models/Puzzles";
import {
  googleDocumentId,
  optionalWorkspaceUrl,
  type PuzzleDocumentType,
  PuzzleDocumentTypes,
} from "../lib/PuzzleDocumentTypes";
import { userMayWritePuzzlesForHunt } from "../lib/permission_stubs";
import ensurePuzzleWorkspace from "./ensurePuzzleWorkspace";
import GlobalHooks from "./GlobalHooks";
import getOrCreateTagByName from "./getOrCreateTagByName";
import GoogleClient from "./googleClientRefresher";
import enqueueJob from "./jobs/framework/enqueueJob";
import withLock from "./withLock";

async function checkForDuplicatePuzzle(huntId: string, url: string) {
  const existingPuzzleWithUrl = await Puzzles.findOneAsync({
    hunt: huntId,
    url,
  });
  if (existingPuzzleWithUrl) {
    throw new Meteor.Error(409, `Puzzle with URL ${url} already exists`);
  }
}

async function createDocumentAndInsertPuzzle(
  huntId: string,
  title: string,
  expectedAnswerCount: number,
  tags: string[],
  url: string | undefined,
  docType: PuzzleDocumentType,
  completedWithNoAnswer: boolean | undefined,
  hasWhiteboard: boolean | undefined,
  documentUrl: string | undefined,
): Promise<string> {
  // Look up each tag by name and map them to tag IDs.
  const tagIds = await Promise.all(
    tags.map((tagName) => {
      return getOrCreateTagByName(huntId, tagName);
    }),
  );

  const fullPuzzle = {
    hunt: huntId,
    title,
    expectedAnswerCount,
    _id: Random.id(),
    tags: [...new Set(tagIds)],
    answers: [],
    url,
    completedWithNoAnswer,
    docType,
    hasWhiteboard,
    documentUrl,
  };

  // Validate and save the complete configuration before scheduling any Drive
  // requests. Document creation remains serialized by the puzzle document lock.
  try {
    await IsInsert.withValue(true, () => Puzzles.schema.parseAsync(fullPuzzle));
  } catch {
    throw new Meteor.Error(400, "题目设置无效，请检查标题、网址和预期答案个数");
  }
  await Puzzles.insertAsync(fullPuzzle);
  if ((docType === "spreadsheet" || docType === "document") && !documentUrl) {
    try {
      await enqueueJob(createPuzzleWorkspace, { puzzleId: fullPuzzle._id });
    } catch {
      // Opening the puzzle can also create its document. Do not report a failed
      // insertion after the puzzle was already saved and invite duplicate retries.
      await Puzzles.updateAsync(fullPuzzle._id, {
        $set: { workspaceError: true },
      });
      Logger.warn("Could not queue puzzle workspace", {
        puzzleId: fullPuzzle._id,
      });
    }
  } else {
    await ensurePuzzleWorkspace(fullPuzzle);
  }
  return fullPuzzle._id;
}

export default async function addPuzzle({
  huntId,
  title,
  tags,
  expectedAnswerCount,
  docType,
  url: rawUrl,
  allowDuplicateUrls,
  completedWithNoAnswer,
  hasWhiteboard,
  documentUrl: rawDocumentUrl,
}: {
  huntId: string;
  title: string;
  url?: string;
  tags: string[];
  expectedAnswerCount: number;
  docType: PuzzleDocumentType;
  allowDuplicateUrls?: boolean;
  completedWithNoAnswer?: boolean;
  hasWhiteboard?: boolean;
  documentUrl?: string;
}) {
  const userId = Meteor.userId();
  const documentUrl = optionalWorkspaceUrl(rawDocumentUrl);
  const url = optionalWorkspaceUrl(rawUrl);

  check(userId, String);
  check(huntId, String);
  check(url, Match.Optional(String));
  check(tags, [String]);
  check(expectedAnswerCount, Number);
  check(docType, Match.OneOf(...PuzzleDocumentTypes));
  check(allowDuplicateUrls, Match.Optional(Boolean));
  check(completedWithNoAnswer, Match.Optional(Boolean));
  check(hasWhiteboard, Match.Optional(Boolean));
  check(documentUrl, Match.Optional(String));
  if (documentUrl) {
    try {
      googleDocumentId(docType, documentUrl);
    } catch (error) {
      throw new Meteor.Error(
        400,
        error instanceof Error ? error.message : "Invalid document URL",
      );
    }
  }
  if (
    (docType === "spreadsheet" || docType === "document") &&
    !documentUrl &&
    (!GoogleClient.ready() || (await Flags.activeAsync("disable.google")))
  ) {
    throw new Meteor.Error(
      400,
      "Google document creation is not configured. Link an existing document or select a standalone whiteboard.",
    );
  }

  const hunt = await Hunts.findOneAsync(huntId);
  if (!hunt) {
    throw new Meteor.Error(404, "Unknown hunt id");
  }

  if (
    !userMayWritePuzzlesForHunt(await MeteorUsers.findOneAsync(userId), hunt)
  ) {
    throw new Meteor.Error(
      401,
      `User ${userId} may not create new puzzles for hunt ${huntId}`,
    );
  }

  // Before we do any writes, try an opportunistic check for duplicates. If a
  // puzzle with this URL already exists, we can short-circuit without
  // creating tags or the Google Doc. We'll still need to repeat this check
  // with the lock held.
  if (url && !allowDuplicateUrls) {
    await checkForDuplicatePuzzle(huntId, url);
  }

  Logger.info("Creating a new puzzle", {
    hunt: huntId,
    title,
  });

  let puzzleId = "";
  if (!url) {
    puzzleId = await createDocumentAndInsertPuzzle(
      huntId,
      title,
      expectedAnswerCount,
      tags,
      url,
      docType,
      completedWithNoAnswer,
      hasWhiteboard,
      documentUrl,
    );
  } else {
    // With a lock, look for a puzzle with the same URL. If present, we reject the insertion
    // unless the client overrides it.
    await withLock(`hunts:${huntId}:puzzle-url:${url}`, async (renew) => {
      const heartbeat = Meteor.setInterval(() => {
        void renew().catch(() => undefined);
      }, 3000);
      try {
        if (!allowDuplicateUrls) {
          await checkForDuplicatePuzzle(huntId, url);
        }
        puzzleId = await createDocumentAndInsertPuzzle(
          huntId,
          title,
          expectedAnswerCount,
          tags,
          url,
          docType,
          completedWithNoAnswer,
          hasWhiteboard,
          documentUrl,
        );
      } finally {
        Meteor.clearInterval(heartbeat);
      }
    });
  }

  // Run any puzzle-creation hooks, like creating a default document
  // attachment or announcing the puzzle to Slack.
  Meteor.defer(() => {
    void GlobalHooks.runPuzzleCreatedHooks(puzzleId);
  });

  return puzzleId;
}
