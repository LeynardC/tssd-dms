import type * as XLSX from "xlsx";
import { parseSpesWorkbook, type SpesParseResult } from "./spesParser";
import { parseGipWorkbook } from "./gipParser";
import { parseAmpWorkbook } from "./ampParser";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { GenericBreakdowns } from "./shared";

// hasParser / PARSER_PROGRAM_IDS live in ./registry (no heavy imports) so
// that callers only checking "does a parser exist" don't pull SheetJS in.
export { hasParser, PARSER_PROGRAM_IDS } from "./registry";

// Single source of truth for the SPES parse-result shape is spesParser.ts;
// the generic, cross-parser slots live in shared.ts. This module re-exports
// both so callers can keep importing from "../parsers".
export type {
  SpesParseResult,
  QuarterlyActual,
  UnutilizedFundEntry,
  LguRateEntry,
} from "./spesParser";
export type {
  GenericBreakdowns,
  PeriodicBucket,
  SubScopeRow,
  MetricUnit,
  ReconciliationFinding,
} from "./shared";

// Every parser returns the SPES-era shape (periods + warnings + the SPES
// bespoke extras, which non-SPES parsers simply leave empty) plus the
// generic breakdown slots that GIP / DO 174 / AMP fill.
export type ParseResult = SpesParseResult & GenericBreakdowns;
type ParserFn = (wb: XLSX.WorkBook) => ParseResult;

// Add do174 here once it's built — same pattern as gip/amp.
// Keys must match PARSER_PROGRAM_IDS in ./registry.
const parsers: Record<string, ParserFn> = {
  spes: parseSpesWorkbook,
  gip: parseGipWorkbook,
  amp: parseAmpWorkbook,
};

const emptyResult = (warnings: string[]): ParseResult => ({
  periods: [] as PeriodEntry[],
  warnings,
  quarterly: {},
  unutilizedFunds: [],
  lguRates: {},
});

export function parseWorkbookForProgram(
  programId: string,
  wb: XLSX.WorkBook,
): ParseResult {
  const parser = parsers[programId];
  if (!parser) {
    return emptyResult([`No parser implemented yet for "${programId}".`]);
  }
  return parser(wb);
}
