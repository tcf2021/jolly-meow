import type { PuzzleType } from "./models/Puzzles";
import type { TagType } from "./models/Tags";

// Meta tags on a puzzle describe its region, rather than all metas in the hunt.
export function relatedPuzzleTags<T extends Pick<TagType, "_id" | "name">>(
  tag: Pick<TagType, "_id" | "name">,
  tags: T[],
  puzzle?: Pick<PuzzleType, "tags">,
): T[] {
  let names = [tag.name];
  if (tag.name.startsWith("meta-for:")) {
    names = [`group:${tag.name.slice("meta-for:".length)}`];
  } else if ((tag.name === "is:meta" || tag.name === "is:metameta") && puzzle) {
    const ownTags = tags.filter((candidate) =>
      puzzle.tags.includes(candidate._id),
    );
    const regions = ownTags.filter((candidate) =>
      candidate.name.startsWith("meta-for:"),
    );
    names =
      regions.length > 0
        ? regions.map(
            (region) => `group:${region.name.slice("meta-for:".length)}`,
          )
        : ownTags
            .filter((candidate) => candidate.name.startsWith("group:"))
            .map((region) => region.name);
  }
  return tags.filter((candidate) => names.includes(candidate.name));
}
