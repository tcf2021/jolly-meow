import { z } from "zod";
import { foreignKey, nonEmptyString } from "./customTypes";
import Model from "./Model";
import withCommon from "./withCommon";

const Whiteboards = new Model(
  "jr_whiteboards",
  withCommon(
    z.object({
      hunt: foreignKey,
      // JSON preserves Excalidraw's extensible element and image formats.
      scene: nonEmptyString,
    }),
  ),
);
export default Whiteboards;
