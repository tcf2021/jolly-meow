import TypedMethod from "./TypedMethod";

export type Sheet = {
  name: string;
  id: number;
};

export default new TypedMethod<
  { documentId: string; refresh?: boolean },
  Sheet[]
>("Documents.methods.listSheets");
