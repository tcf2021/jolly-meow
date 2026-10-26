import type { PuzzleGroup } from "./puzzle-sort-and-group";

export default function moveGroupOrder(
  groups: PuzzleGroup[],
  tagId: string,
  direction: "up" | "down",
  neighborTagId?: string,
): string[] | undefined {
  const order: string[] = [];
  let neighbor: string | undefined;
  const visit = (siblings: PuzzleGroup[]) => {
    const movable = siblings.filter((g) =>
      g.sharedTag?.name.startsWith("group:"),
    );
    const index = movable.findIndex((g) => g.sharedTag?._id === tagId);
    if (index !== -1 && !neighbor) {
      const target = neighborTagId
        ? movable.findIndex((g) => g.sharedTag?._id === neighborTagId)
        : index + (direction === "up" ? -1 : 1);
      if (direction === "up" ? target >= 0 && target < index : target > index)
        neighbor = movable[target]?.sharedTag?._id;
    }
    for (const group of siblings) {
      const id = group.sharedTag?._id;
      if (
        id &&
        group.sharedTag?.name.startsWith("group:") &&
        !order.includes(id)
      )
        order.push(id);
      visit(group.subgroups);
    }
  };
  visit(groups);
  if (!neighbor) return undefined;
  const from = order.indexOf(tagId),
    to = order.indexOf(neighbor);
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}
