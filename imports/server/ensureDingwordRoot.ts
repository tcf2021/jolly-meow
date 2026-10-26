import buildDingwordTree from "../lib/buildDingwordTree";
import Dingwords from "../lib/models/Dingwords";
import withLock from "./withLock";

export default function ensureDingwordRoot(createdBy: string) {
  return withLock("dingwords:root", async () => {
    const words = await Dingwords.find().fetchAsync();
    const { nodes, rootNodeId } = buildDingwordTree(words);
    const root = nodes.get(rootNodeId)!;
    const storedRoot = words.find((word) => word._id === rootNodeId);
    if (!storedRoot) {
      return Dingwords.insertAsync({
        name: "__root__",
        children: root.children,
        selectable: false,
        createdBy,
      });
    }
    if (
      storedRoot.selectable !== false ||
      JSON.stringify(storedRoot.children) !== JSON.stringify(root.children)
    ) {
      await Dingwords.updateAsync(rootNodeId, {
        $set: { children: root.children, selectable: false },
      });
    }
    return rootNodeId;
  });
}
