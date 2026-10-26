import type { DingwordFilteredType } from "../lib/models/Dingwords";
import TypedMethod from "./TypedMethod";

export default new TypedMethod<
  {
    changedDingwords: DingwordFilteredType[];
    deletedDingwordIds: string[];
  },
  void
>("Dingwords.methods.update");
