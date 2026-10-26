import type { DingwordFilteredType } from "./models/Dingwords";

export default function buildDingwordTree(
  dingwords: Iterable<
    Pick<DingwordFilteredType, "_id" | "name"> & Partial<DingwordFilteredType>
  >,
) {
  const nodes = new Map<string, DingwordFilteredType>();
  for (const value of dingwords) {
    nodes.set(value._id, {
      _id: value._id,
      name: value.name,
      children: [...(value.children ?? [])],
      selectable: value.selectable ?? true,
    });
  }
  const storedRoot = [...nodes.values()].find(
    (node) => node.name === "__root__",
  );
  const root = storedRoot ?? {
    _id: "__root__",
    name: "__root__",
    children: [],
    selectable: false,
  };
  root.selectable = false;
  nodes.set(root._id, root);
  const children = new Set<string>();
  for (const node of nodes.values()) {
    node.children = [...new Set(node.children)].filter(
      (id) => id !== node._id && id !== root._id && nodes.has(id),
    );
    node.children.forEach((id) => children.add(id));
  }
  for (const id of nodes.keys()) {
    if (id !== root._id && !children.has(id)) root.children.push(id);
  }
  return { nodes, rootNodeId: root._id };
}
