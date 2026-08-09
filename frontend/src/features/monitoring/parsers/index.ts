import * as XLSX from "xlsx";
import {
  parseSpesWorkbook,
  type UnutilizedFundEntry,
  type QuarterlyActual,
} from "./spesParser";
import type { PeriodEntry } from "../data/mockMonitoring";

export interface SpesParseResult {
  periods: PeriodEntry[];
  warnings: string[];
  quarterly?: Record<string, QuarterlyActual[]>;
  unutilizedFunds?: UnutilizedFundEntry[];
}

export type ParseResult = SpesParseResult;
type ParserFn = (wb: XLSX.WorkBook) => SpesParseResult;

// Add gip/do174/amp here once each parser is built — same pattern as spes.
const parsers: Record<string, ParserFn> = {
  spes: parseSpesWorkbook,
};

export function hasParser(programId: string): boolean {
  return programId in parsers;
}

export function parseWorkbookForProgram(
  programId: string,
  wb: XLSX.WorkBook,
): SpesParseResult {
  const parser = parsers[programId];
  if (!parser) {
    return {
      periods: [],
      warnings: [`No parser implemented yet for "${programId}".`],
    };
  }
  return parser(wb);
}
