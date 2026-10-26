import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ documentId: string }, boolean>(
  "Documents.methods.getDocumentAnyoneReaderStatus",
);
