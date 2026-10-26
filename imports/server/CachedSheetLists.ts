import type { Sheet } from "../methods/listDocumentSheets";

export default class CachedSheetLists {
  private entries = new Map<
    string,
    {
      source: unknown;
      expires: number;
      sheets?: Sheet[];
      pending?: Promise<Sheet[]>;
    }
  >();

  constructor(private ttlMs = 60_000) {}

  async load(
    spreadsheetId: string,
    source: unknown,
    fetchSheets: () => Promise<Sheet[]>,
    refresh = false,
  ): Promise<Sheet[]> {
    const previous = this.entries.get(spreadsheetId);
    if (previous && previous.source === source) {
      if (previous.pending) return previous.pending;
      if (!refresh && previous.sheets && previous.expires > Date.now())
        return previous.sheets;
    }
    const entry = { source, expires: 0 } as {
      source: unknown;
      expires: number;
      sheets?: Sheet[];
      pending?: Promise<Sheet[]>;
    };
    this.entries.set(spreadsheetId, entry);
    if (this.entries.size > 128) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    entry.pending = Promise.resolve().then(fetchSheets);
    try {
      entry.sheets = await entry.pending;
      entry.expires = Date.now() + this.ttlMs;
      return entry.sheets;
    } catch (error) {
      if (this.entries.get(spreadsheetId) === entry)
        this.entries.delete(spreadsheetId);
      throw error;
    } finally {
      entry.pending = undefined;
    }
  }
}
