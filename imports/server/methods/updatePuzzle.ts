import { check, Match } from "meteor/check";
import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import Flags from "../../Flags";
import Logger from "../../Logger";
import Documents from "../../lib/models/Documents";
import Hunts from "../../lib/models/Hunts";
import MeteorUsers from "../../lib/models/MeteorUsers";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Puzzles from "../../lib/models/Puzzles";
import {
  googleDocumentId,
  optionalWorkspaceUrl,
  PuzzleDocumentTypes,
  puzzleHasWhiteboard,
} from "../../lib/PuzzleDocumentTypes";
import { userMayWritePuzzlesForHunt } from "../../lib/permission_stubs";
import updatePuzzle from "../../methods/updatePuzzle";
import { scheduleHuntDocumentIndex } from "../automaticHuntDocumentIndex";
import ensurePuzzleWorkspace from "../ensurePuzzleWorkspace";
import GlobalHooks from "../GlobalHooks";
import { renameDocument } from "../gdrive";
import getOrCreateTagByName from "../getOrCreateTagByName";
import getTeamName from "../getTeamName";
import GoogleClient from "../googleClientRefresher";
import {
  clearDisabledPuzzleWhiteboard,
  removeDisabledDocumentAssociation,
  trashDisabledGoogleDocument,
  workspaceCleanupError,
} from "../puzzleWorkspaceCleanup";
import withRenewedLock from "../withRenewedLock";
import defineMethod from "./defineMethod";

defineMethod(updatePuzzle, {
  validate(arg) {
    check(arg, {
      puzzleId: String,
      title: String,
      url: Match.Optional(String),
      tags: [String],
      expectedAnswerCount: Number,
      docType: Match.Optional(Match.OneOf(...PuzzleDocumentTypes)),
      documentUrl: Match.Optional(String),
      hasWhiteboard: Match.Optional(Boolean),
      confirmWorkspaceDeletion: Match.Optional(Boolean),
      completedWithNoAnswer: Match.Optional(Boolean),
      // We accept this argument since it's provided by the form, but it's not checked here - only
      // during puzzle creation, to avoid duplicates when creating new puzzles.
      allowDuplicateUrls: Match.Optional(Boolean),
    });

    return arg;
  },

  run({
    puzzleId,
    title,
    url,
    tags,
    expectedAnswerCount,
    docType,
    documentUrl: rawDocumentUrl,
    hasWhiteboard,
    confirmWorkspaceDeletion,
    completedWithNoAnswer,
  }) {
    check(this.userId, String);
    const userId = this.userId;
    return withRenewedLock(`puzzle:${puzzleId}:edit`, async () => {
      const documentUrl = optionalWorkspaceUrl(rawDocumentUrl);

      const oldPuzzle = await Puzzles.findOneAllowingDeletedAsync(puzzleId);
      if (!oldPuzzle) {
        throw new Meteor.Error(404, "Unknown puzzle id");
      }
      if (oldPuzzle.purging)
        throw new Meteor.Error(409, "Puzzle is being permanently deleted");
      const hunt = await Hunts.findOneAsync(oldPuzzle.hunt);
      if (
        !userMayWritePuzzlesForHunt(
          await MeteorUsers.findOneAsync(userId),
          hunt,
        )
      ) {
        throw new Meteor.Error(
          401,
          `User ${this.userId} may not modify puzzles from hunt ${oldPuzzle.hunt}`,
        );
      }
      if (documentUrl) {
        try {
          googleDocumentId(
            docType ?? oldPuzzle.docType ?? "spreadsheet",
            documentUrl,
          );
        } catch (error) {
          throw new Meteor.Error(
            400,
            error instanceof Error ? error.message : "文档链接无效",
          );
        }
      }
      const oldDocument = await Documents.findOneAsync({ puzzle: puzzleId });
      const clearWhiteboard =
        hasWhiteboard === false && puzzleHasWhiteboard(oldPuzzle);
      const oldDocType =
        oldPuzzle.docType ?? oldDocument?.value.type ?? "spreadsheet";
      const closeGoogle =
        docType === "none" &&
        (oldDocument?.provider === "google" ||
          oldDocType === "spreadsheet" ||
          oldDocType === "document");
      if ((clearWhiteboard || closeGoogle) && !confirmWorkspaceDeletion)
        throw workspaceCleanupError(400, "confirmationRequired");
      if (
        (docType === "spreadsheet" || docType === "document") &&
        !documentUrl &&
        ((oldPuzzle.docType ?? oldDocument?.value.type ?? "spreadsheet") !==
          docType ||
          !!oldPuzzle.documentUrl) &&
        (!GoogleClient.ready() || (await Flags.activeAsync("disable.google")))
      ) {
        throw new Meteor.Error(
          400,
          "尚未配置 Google 自动创建，请填写已有的 Google 链接，或选择不关联 Google 文档。白板可以独立启用。",
        );
      }

      // Look up each tag by name and map them to tag IDs.
      const tagIds = await Promise.all(
        tags.map((tagName) => {
          return getOrCreateTagByName(oldPuzzle.hunt, tagName);
        }),
      );

      Logger.info("Updating a puzzle", {
        hunt: oldPuzzle.hunt,
        puzzle: puzzleId,
        title,
        expectedAnswerCount,
      });

      const update: Mongo.Modifier<PuzzleType> = {
        $set: {
          title,
          expectedAnswerCount,
          tags: [...new Set(tagIds)],
          ...(hasWhiteboard !== undefined ? { hasWhiteboard } : {}),
          ...(clearWhiteboard ? { whiteboardGeneration: Random.id() } : {}),
        },
      };
      if (url) {
        update.$set = { ...update.$set, url };
      } else {
        update.$unset = { url: "" };
      }
      if (completedWithNoAnswer !== undefined) {
        update.$set = { ...update.$set, completedWithNoAnswer };
      }
      if (docType === "none") {
        // Drain queued provisioning before recycling its file and dropping the
        // association. A queued creator also checks the current document type.
        await withRenewedLock(`puzzle:${puzzleId}:documents`, async () => {
          const document = await Documents.findOneAsync({ puzzle: puzzleId });
          if (document?.provider === "google") {
            if (!confirmWorkspaceDeletion)
              throw workspaceCleanupError(400, "confirmationRequired");
            await trashDisabledGoogleDocument(
              puzzleId,
              document.value.id,
              document.value.type,
            );
          } else if (
            oldPuzzle.documentUrl &&
            (oldDocType === "spreadsheet" || oldDocType === "document")
          ) {
            await trashDisabledGoogleDocument(
              puzzleId,
              googleDocumentId(oldDocType, oldPuzzle.documentUrl),
              oldDocType,
            );
          }
          await Puzzles.updateAsync(puzzleId, {
            ...update,
            $set: { ...update.$set, docType: "none" },
            $unset: { ...update.$unset, documentUrl: "" },
          });
          if (document) await removeDisabledDocumentAssociation(document._id);
          if (clearWhiteboard) await clearDisabledPuzzleWhiteboard(puzzleId);
        });
        scheduleHuntDocumentIndex(oldPuzzle.hunt, 0);
      } else {
        await Puzzles.updateAsync(puzzleId, update);
        if (clearWhiteboard) await clearDisabledPuzzleWhiteboard(puzzleId);
      }
      if (docType && docType !== "none") {
        // Keep the archived workspace and its data when switching types.
        const nextUrl = documentUrl === "" ? undefined : documentUrl;
        const changed =
          (oldPuzzle.docType ?? oldDocument?.value.type ?? "spreadsheet") !==
            docType || oldPuzzle.documentUrl !== nextUrl;
        if (changed && oldDocument)
          await Documents.updateAsync(oldDocument._id, {
            $set: { deleted: true },
          });
        await Puzzles.updateAsync(puzzleId, {
          $set: { docType, ...(nextUrl ? { documentUrl: nextUrl } : {}) },
          ...(!nextUrl ? { $unset: { documentUrl: "" } } : {}),
        });
        const nextPuzzle = (await Puzzles.findOneAsync(puzzleId))!;
        await ensurePuzzleWorkspace(nextPuzzle);
      }

      // Run any puzzle update hooks
      Meteor.defer(
        Meteor.bindEnvironment(() => {
          void GlobalHooks.runPuzzleUpdatedHooks(puzzleId, oldPuzzle);
        }),
      );

      if (oldPuzzle.title !== title) {
        Meteor.defer(
          Meteor.bindEnvironment(async () => {
            const doc = await Documents.findOneAsync({ puzzle: puzzleId });
            if (
              doc?.provider !== "google" ||
              oldPuzzle.documentUrl ||
              documentUrl ||
              (await Flags.activeAsync("disable.google"))
            )
              return;
            const teamName = await getTeamName();
            await renameDocument(doc.value.id, `${title}: ${teamName}`);
          }),
        );
      }
    });
  },
});
