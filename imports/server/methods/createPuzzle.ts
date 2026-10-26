import { check, Match } from "meteor/check";
import { PuzzleDocumentTypes } from "../../lib/PuzzleDocumentTypes";
import createPuzzle from "../../methods/createPuzzle";
import addPuzzle from "../addPuzzle";
import defineMethod from "./defineMethod";

defineMethod(createPuzzle, {
  validate(arg) {
    check(arg, {
      huntId: String,
      title: String,
      url: Match.Optional(String),
      tags: [String],
      expectedAnswerCount: Number,
      docType: Match.OneOf(...PuzzleDocumentTypes),
      allowDuplicateUrls: Match.Optional(Boolean),
      completedWithNoAnswer: Match.Optional(Boolean),
      hasWhiteboard: Match.Optional(Boolean),
      documentUrl: Match.Optional(String),
    });
    return arg;
  },

  run({
    huntId,
    title,
    tags,
    expectedAnswerCount,
    docType,
    url,
    allowDuplicateUrls,
    completedWithNoAnswer,
    hasWhiteboard,
    documentUrl,
  }) {
    check(this.userId, String);
    return addPuzzle({
      huntId,
      title,
      tags,
      expectedAnswerCount,
      docType,
      url,
      allowDuplicateUrls,
      completedWithNoAnswer,
      hasWhiteboard,
      documentUrl,
    });
  },
});
