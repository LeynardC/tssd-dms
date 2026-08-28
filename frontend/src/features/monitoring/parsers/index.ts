import * as XLSX from "xlsx";
import { parseSpesWorkbook, type SpesParseResult } from "./spesParser";
import type { PeriodEntry } from "../data/mockMonitoring";

// Single source of truth for the parse-result shape is spesParser.ts — this
// module just re-exports it so callers can keep importing from "../parsers".
export type {
  SpesParseResult,
  QuarterlyActual,
  UnutilizedFundEntry,
  LguRateEntry,
} from "./spesParser";

export type ParseResult = SpesParseResult;
type ParserFn = (wb: XLSX.WorkBook) => SpesParseResult;

// Add gip/do174/amp here once each parser is built — same pattern as spes.
const parsers: Record<string, ParserFn> = {
  spes: parseSpesWorkbook,
};

export function hasParser(programId: string): boolean {
  return programId in parsers;
}

const emptyResult = (warnings: string[]): SpesParseResult => ({
  periods: [] as PeriodEntry[],
  warnings,
  quarterly: {},
  unutilizedFunds: [],
  lguRates: {},
});

export function parseWorkbookForProgram(
  programId: string,
  wb: XLSX.WorkBook,
): SpesParseResult {
  const parser = parsers[programId];
  if (!parser) {
    return emptyResult([`No parser implemented yet for "${programId}".`]);
  }
  return parser(wb);
}
