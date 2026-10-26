import ChatMessages from "../../lib/models/ChatMessages";
import ChatNotifications from "../../lib/models/ChatNotifications";
import Dingwords from "../../lib/models/Dingwords";
import MeteorUsers from "../../lib/models/MeteorUsers";
import getOrCreateDingwordByName from "../getOrCreateDingwordByName";
import Migrations from "./Migrations";

// Studio previously stored dingword names and combined @/# mention nodes.
// Convert these records before the upstream tree/editor reads them.
Migrations.add({
  version: 53,
  name: "Convert Studio dingwords and legacy mention nodes to upstream format",
  async up() {
    await Dingwords.collection
      .rawCollection()
      .updateMany(
        { children: { $exists: false } },
        { $set: { children: [], selectable: true } },
      );
    const ids = new Set(
      (await Dingwords.find().fetchAsync()).map((d) => d._id),
    );
    const resolve = async (value: string) => {
      if (ids.has(value)) return value;
      const id = await getOrCreateDingwordByName(value);
      ids.add(id);
      return id;
    };
    for await (const user of MeteorUsers.find({
      dingwords: { $exists: true },
    })) {
      const dingwords = await Promise.all((user.dingwords ?? []).map(resolve));
      await MeteorUsers.updateAsync(user._id, {
        $set: { dingwords: [...new Set(dingwords)] },
      });
    }
    for (const model of [ChatMessages, ChatNotifications]) {
      const collection = model.collection.rawCollection();
      for await (const message of collection.find({
        "content.children.mentionType": { $exists: true },
      })) {
        const children = await Promise.all(
          (message as any).content.children.map(async (node: any) => {
            if (node.type !== "mention" || typeof node.itemId !== "string")
              return node;
            return node.mentionType === "#"
              ? { type: "dingword", dingwordId: await resolve(node.itemId) }
              : { type: "mention", userId: node.itemId };
          }),
        );
        await collection.updateOne(
          { _id: message._id },
          { $set: { "content.children": children } },
        );
      }
    }
  },
});
