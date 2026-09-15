// The program codes that have a real .xlsx monitoring parser.
//
// This lives in its own tiny module (no imports) so that code which only
// needs to KNOW whether a parser exists — global search, the Monitoring Hub
// landing, the Export Center program list — can ask without pulling in the
// parser implementations, and with them the ~1 MB SheetJS library, through
// parsers/index.ts. Only the actual upload / parse paths import index.ts.
//
// Keep this list in sync with the `parsers` record in ./index.ts.
export const PARSER_PROGRAM_IDS = ["spes", "gip", "amp"] as const;

export function hasParser(programId: string): boolean {
  return (PARSER_PROGRAM_IDS as readonly string[]).includes(programId);
}
