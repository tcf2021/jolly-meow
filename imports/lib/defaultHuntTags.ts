// Keep new hunts and the compatibility repair on the same default vocabulary.
export const DEFAULT_HUNT_TAGS = [
  "is:meta",
  "is:metameta",
  "is:runaround",
  "priority:high",
  "priority:low",
  "type:crossword",
  "type:conundrum",
  "group:events",
  "needs:extraction",
  "needs:aha",
] as const;
