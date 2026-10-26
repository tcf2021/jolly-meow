import Logger from "../Logger";
import Dingwords from "../lib/models/Dingwords";

export default async function getOrCreateDingwordByName(
  name: string,
  createdBy?: string,
): Promise<string> {
  const existingDingword = await Dingwords.findOneAsync({ name });
  if (existingDingword) {
    return existingDingword._id;
  }

  Logger.info("Creating a new dingword", { name });
  const newDingwordId = await Dingwords.insertAsync({
    name,
    children: [],
    selectable: true,
    ...(createdBy ? { createdBy } : {}),
  });

  return newDingwordId;
}
