import { z } from "zod";
import { foreignKey, nonEmptyString } from "./customTypes";
import type { ModelType } from "./Model";
import SoftDeletedModel from "./SoftDeletedModel";
import withCommon from "./withCommon";

const Dingword = withCommon(
  z.object({
    name: nonEmptyString,
    children: foreignKey.array(),
    selectable: z.boolean().optional(),
  }),
);

const Dingwords = new SoftDeletedModel("jr_dingwords", Dingword);
Dingwords.addIndex({ deleted: 1, name: 1 });
export type DingwordType = ModelType<typeof Dingwords>;
export type DingwordFilteredType = {
  _id: string;
  name: string;
  children: string[];
  selectable: boolean;
};

export default Dingwords;
