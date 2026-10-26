import TypedMethod from "./TypedMethod";

export default new TypedMethod<{ documentId: string; enable: boolean }, void>(
  "Documents.methods.setDocumentAnyoneReaderStatus",
);
