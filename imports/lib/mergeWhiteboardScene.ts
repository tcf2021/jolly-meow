export type WhiteboardElement = {
  id: string;
  version: number;
  versionNonce: number;
  [key: string]: unknown;
};
export type WhiteboardScene = {
  elements: WhiteboardElement[];
  files: Record<string, unknown>;
};

// Merge individual elements, including deletion tombstones. A stale client must
// never replace another teammate's newer edits or remove their added elements.
export default function mergeWhiteboardScene(
  current: WhiteboardScene,
  incoming: WhiteboardScene,
): WhiteboardScene {
  const elements = new Map(
    current.elements.map((element) => [element.id, element]),
  );
  for (const element of incoming.elements) {
    const previous = elements.get(element.id);
    if (
      !previous ||
      element.version > previous.version ||
      (element.version === previous.version &&
        element.versionNonce < previous.versionNonce)
    ) {
      elements.set(element.id, element);
    }
  }
  return {
    elements: [...elements.values()].toSorted((a, b) => {
      if (typeof a.index !== "string" || typeof b.index !== "string") return 0;
      if (a.index < b.index) return -1;
      if (a.index > b.index) return 1;
      return 0;
    }),
    files: { ...current.files, ...incoming.files },
  };
}
