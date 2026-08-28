import type { PeriodEntry, Metric } from "../monitoring/data/mockMonitoring";
import type {
  QuarterlyActual,
  UnutilizedFundEntry,
  LguRateEntry,
} from "../monitoring/parsers";

export interface ReportInput {
  programName: string;
  programFullName: string;
  periodLabel: string;
  preparedBy: string;
  sourceFileName: string;
  entries: PeriodEntry[]; // includes the Region / aggregate row
  quarterly?: Record<string, QuarterlyActual[]>;
  unutilizedFunds?: UnutilizedFundEntry[];
  lguRates?: Record<string, LguRateEntry[]>;
}

export const AGG = /region|mimaropa|total/i;

export function metricOf(e: PeriodEntry, key: string): Metric | undefined {
  return e.metrics.find((mm) => mm.key === key);
}

export function ratio(actual: number, target: number | null): number | null {
  return target ? (actual / target) * 100 : null;
}

// Trim floating-point noise (690664.3279999997 -> 690664.33).
export function num(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitScopes(entries: PeriodEntry[]): {
  region: PeriodEntry | null;
  provinces: PeriodEntry[];
} {
  return {
    region: entries.find((e) => AGG.test(e.scope)) ?? null,
    provinces: entries.filter((e) => !AGG.test(e.scope)),
  };
}

// "No. of Students (Pledge)" -> "Pledge", "No. of Beneficiaries" -> "Beneficiaries"
export function shortLabel(label: string): string {
  const s = label
    .replace(/^no\.\s*of\s*(students\s*)?/i, "")
    .replace(/[()]/g, "")
    .trim();
  return s || label;
}

// Maps a parser note string to a short category. Kept in sync with the
// note wording emitted by spesParser.ts.
export function noteCategory(note: string): string {
  const s = note.toLowerCase();
  if (s.includes("significantly exceeds target")) return "Data quality";
  if (s.includes("additional fund needed")) return "Fund gap";
  if (s.includes("100% counterpart")) return "Counterpart";
  if (s.includes("documents/insurance")) return "Documentation";
  if (s.includes("payment processing")) return "Processing";
  if (s.includes("cost-share split")) return "Cost share";
  if (s.includes("avg. processing time")) return "Processing time";
  return "Note";
}

export interface DataQualityFlags {
  exceed: { scope: string; placed: number | null; target: number | null }[];
  gaps: { scope: string; text: string }[];
}

export function collectDataQuality(provinces: PeriodEntry[]): DataQualityFlags {
  const exceed: DataQualityFlags["exceed"] = [];
  const gaps: DataQualityFlags["gaps"] = [];
  for (const p of provinces) {
    for (const n of p.extraNotes ?? []) {
      const s = n.toLowerCase();
      if (s.includes("significantly exceeds target")) {
        exceed.push({
          scope: p.scope,
          placed: metricOf(p, "placed")?.actual ?? null,
          target: metricOf(p, "placed")?.target ?? null,
        });
      }
      if (s.includes("additional fund needed") && !/PHP\s*0\b|₱0\b/.test(n)) {
        gaps.push({
          scope: p.scope,
          text: n.replace(/^Additional fund needed[^:]*:\s*/i, ""),
        });
      }
    }
  }
  return { exceed, gaps };
}

export interface QuarterRow {
  scope: string;
  quarter: string;
  beneficiaries: number;
  fund: number;
}

export function quarterlyRows(
  quarterly: Record<string, QuarterlyActual[]>,
): { rows: QuarterRow[]; regionByQuarter: QuarterRow[] } {
  const rows: QuarterRow[] = [];
  const totals: Record<string, { b: number; f: number }> = {};
  for (const scope of Object.keys(quarterly)) {
    for (const q of quarterly[scope]) {
      totals[q.quarter] ??= { b: 0, f: 0 };
      totals[q.quarter].b += q.beneficiaries;
      totals[q.quarter].f += q.fund;
      rows.push({
        scope,
        quarter: q.quarter,
        beneficiaries: q.beneficiaries,
        fund: q.fund,
      });
    }
  }
  const regionByQuarter = Object.keys(totals)
    .sort()
    .map((q) => ({
      scope: "MIMAROPA Region",
      quarter: q,
      beneficiaries: totals[q].b,
      fund: totals[q].f,
    }));
  return { rows, regionByQuarter };
}

export function fundTotals(funds: UnutilizedFundEntry[]): {
  totalStart: number;
  totalRemaining: number;
  recordedCount: number;
} {
  let totalStart = 0;
  let totalRemaining = 0;
  let recordedCount = 0;
  for (const u of funds) {
    if (typeof u.startingBalance === "number") totalStart += u.startingBalance;
    if (
      typeof u.startingBalance === "number" &&
      typeof u.remainingBalance === "number"
    ) {
      totalRemaining += u.remainingBalance;
      recordedCount++;
    }
  }
  return { totalStart, totalRemaining, recordedCount };
}

export function lguRateSummary(
  lguRates: Record<string, LguRateEntry[]>,
): { scope: string; count: number; min: number; max: number }[] {
  return Object.keys(lguRates)
    .sort()
    .map((scope) => {
      const rates = lguRates[scope].map((r) => r.rate);
      return {
        scope,
        count: rates.length,
        min: Math.min(...rates),
        max: Math.max(...rates),
      };
    });
}

// Clean, punctuation-free base name for the saved file.
export function reportBaseName(input: {
  programName: string;
  periodLabel: string;
}): string {
  return `${input.programName} Monitoring Report ${input.periodLabel}`
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Sheet list for the "This export contains" hint in the preview modal.
export function exportSheetNames(input: {
  entries: PeriodEntry[];
  quarterly?: Record<string, QuarterlyActual[]>;
  unutilizedFunds?: UnutilizedFundEntry[];
  lguRates?: Record<string, LguRateEntry[]>;
}): string[] {
  const names = ["Summary"];
  if (input.quarterly && Object.keys(input.quarterly).length)
    names.push("Quarterly");
  if (input.unutilizedFunds && input.unutilizedFunds.length)
    names.push("Fund Reallocation");
  const hasNotes = input.entries.some(
    (e) => e.note || (e.extraNotes && e.extraNotes.length),
  );
  if (hasNotes) names.push("Program Indicators");
  if (input.lguRates && Object.keys(input.lguRates).length)
    names.push("Hiring Rates");
  return names;
}
