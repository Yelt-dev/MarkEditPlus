// Stub for the ESM-only `marked` package under Jest (CommonJS).
// The preview module is not exercised by tests; this only satisfies its import.
export class Marked {
  constructor(..._extensions: unknown[]) {
    // no-op
  }

  parse(source: string): string {
    return source;
  }
}

export const marked = {
  parse: (source: string): string => source,
};
