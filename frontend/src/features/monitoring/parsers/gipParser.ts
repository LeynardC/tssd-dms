import * as XLSX from "xlsx";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { SpesParseResult } from "./spesParser";
import type {
  GenericBreakdowns,
  PeriodicBucket,
  PeriodicSubRow,
  SubScopeRow,
  ReconciliationFinding,
} from "./shared";

// GIP monitoring is driven by one workbook with two data sheets:
//   • "Monitoring"       – the transaction log: one row per half-month
//                          (1–15 / 16–EOM) stipend payroll, per NTP.
//   • "Summary per NTP"   – the budget ledger: allocation / slots per Notice
//                          to Proceed, grouped by province.
// The workbook's own "Utilized" SUMIFs are known to be short-ranged, so this
// parser recomputes utilisation from the full Monitoring sheet instead of
// trusting the summary's computed column.

type Row = any[];

function sheetToRows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Row[];
}

// A1-style reference for a 0-based (col, rowIndex) pair, so a finding can
// point a reviewer straight at the cell to fix. `rowIndex` is the index into
// the array returned by sheetToRows(), i.e. sheet row `rowIndex + 1`.
function cellRef(col: number, rowIndex: number): string {
  return `${XLSX.utils.encode_col(col)}${rowIndex + 1}`;
}

// Collapse a run of same-column refs into ranges: B7,B8,B9,B12 -> "B7:B9, B12".
function condenseRefs(refs: string[]): string {
  const parsed = refs
    .map((r) => {
      const m = r.match(/^([A-Z]+)(\d+)$/);
      return m ? { col: m[1], row: parseInt(m[2], 10) } : null;
    })
    .filter((x): x is { col: string; row: number } => x !== null)
    .sort((a, b) => a.col.localeCompare(b.col) || a.row - b.row);
  const out: string[] = [];
  let i = 0;
  while (i < parsed.length) {
    let j = i;
    while (
      j + 1 < parsed.length &&
      parsed[j + 1].col === parsed[i].col &&
      parsed[j + 1].row === parsed[j].row + 1
    )
      j++;
    out.push(
      i === j
        ? `${parsed[i].col}${parsed[i].row}`
        : `${parsed[i].col}${parsed[i].row}:${parsed[i].col}${parsed[j].row}`,
    );
    i = j + 1;
  }
  return out.join(", ");
}

function lc(v: any): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

// Resolve a column by header text rather than a fixed index, so a logsheet
// that inserts or drops a column shifts nothing downstream. Returns -1 when
// nothing matches (caller treats that as "layout changed" and bails).
function colByHeader(header: Row, ...needles: string[]): number {
  return header.findIndex((h) => {
    const v = lc(h);
    return v !== "" && needles.every((n) => v.includes(n));
  });
}

function findHeaderRow(rows: Row[], ...mustIncludeAll: string[]): number {
  return rows.findIndex((r) =>
    mustIncludeAll.every((needle) =>
      r.some((c) => typeof c === "string" && c.toLowerCase().includes(needle)),
    ),
  );
}

function num(v: any): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function asDate(v: any): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "number")
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  return null;
}

function detectYear(wb: XLSX.WorkBook): number {
  for (const name of wb.SheetNames) {
    const m = name.match(/(20\d{2})/);
    if (m) return parseInt(m[1], 10);
  }
  return new Date().getFullYear();
}

// --- Scope model: 5 provinces, the RO as its own scope, plus a region-wide
// total. The dashboard's overview charts already exclude anything matching
// /region|mimaropa|total/i, so "Regional Office" and "Region" both read as
// aggregates there, which is what we want. ---
const PROVINCES = [
  "Oriental Mindoro",
  "Occidental Mindoro",
  "Marinduque",
  "Romblon",
  "Palawan",
] as const;
const RO_SCOPE = "Regional Office";
const REGION_TOTAL = "Region";

// One lookup for both the NTP-code prefix (ORMIN-03-2025, MAR-08-2025, …) and
// the free-text Province column. Encoders are inconsistent — abbreviations,
// spelled-out names, and any casing all appear — so every known spelling maps
// to the same scope. Keys are compared UPPERCASE after trimming.
const SCOPE_ALIASES: Record<string, string> = {
  // Oriental Mindoro
  ORMIN: "Oriental Mindoro",
  "ORIENTAL MINDORO": "Oriental Mindoro",
  "OR. MINDORO": "Oriental Mindoro",
  "OR MINDORO": "Oriental Mindoro",
  // Occidental Mindoro
  OCCMIN: "Occidental Mindoro",
  OCCIMIN: "Occidental Mindoro",
  OCCI: "Occidental Mindoro",
  "OCCIDENTAL MINDORO": "Occidental Mindoro",
  "OCC. MINDORO": "Occidental Mindoro",
  "OCC MINDORO": "Occidental Mindoro",
  // Marinduque
  MARQ: "Marinduque",
  MAR: "Marinduque",
  MARI: "Marinduque",
  MARINDUQUE: "Marinduque",
  // Romblon
  ROM: "Romblon",
  ROMB: "Romblon",
  ROMBLON: "Romblon",
  // Palawan
  PAL: "Palawan",
  PALW: "Palawan",
  PLW: "Palawan",
  PALAWAN: "Palawan",
  // Regional Office
  MIMAROPA: RO_SCOPE,
  RO: RO_SCOPE,
  "REGIONAL OFFICE": RO_SCOPE,
  "REGION IV-B": RO_SCOPE,
  "REGION 4B": RO_SCOPE,
};

// Tidy a raw NTP code for matching & display: uppercase, drop spaces around
// the hyphens / ampersand, collapse the rest. "ormin - 01 - 2025" -> "ORMIN-01-2025".
function normalizeNtp(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*&\s*/g, "&")
    .replace(/\s+/g, " ");
}

// Accepts a code with any casing and optional spaces around the separators.
const NTP_RE = /^[A-Z]+-[0-9]+(?:&[0-9]+)?-[0-9]{4}$/;

// Resolve a Province-column value (abbreviation or spelled out, any casing).
function scopeFromProvince(raw: unknown): string | null {
  const key = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return SCOPE_ALIASES[key] ?? SCOPE_ALIASES[key.replace(/[.\s]/g, "")] ?? null;
}

function scopeForNtp(ntp: string): string | null {
  const prefix = normalizeNtp(ntp).split("-")[0];
  return prefix ? (SCOPE_ALIASES[prefix] ?? null) : null;
}

interface Allocation {
  ntp: string;
  scope: string;
  proponent: string;
  adl: string;
  slots: number;
  fund: number;
}

// Fallback daily rate — used only for a row (or whole scope) that carries no
// "Rate per Day" on the Monitoring sheet. The real per-NTP rate is always
// read from the sheet first (₱430 for the FY2025 file, ₱395 for 2024
// carry-over). ₱455 is the latest MIMAROPA regional rate, so it's the best
// guess for any newer row that's missing one.
const LATEST_RATE_PER_DAY = 455;
function fallbackRate(_scope: string): number {
  return LATEST_RATE_PER_DAY;
}

interface Disbursement {
  ntp: string;
  scope: string;
  amount: number;
  rate: number; // Rate per Day, 0 when the sheet has none
  interns: number;
  month: string; // "2025-03", or "9999-99" for undated rows
  monthLabel: string; // "Mar 2025" / "Undated"
  cutoff: string; // "2025-03-A" / "2025-03-B", or the month key when the half is unknown
  cutoffLabel: string; // "Mar 1–15, 2025" / "Mar 16–end, 2025"
  roReceived: Date | null;
  toEup: Date | null;
  remarks: string;
  provinceRaw: string; // the Province column value, as typed
  adl: string; // ADL No. column — its value groups a fund source / batch
  partner: string; // Partner Agency column — who the interns are with
  row: number; // Monitoring sheet row number (1-based), for citing the cell
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Employment-period text like "January 16-31, 2025" / "November 1-30, 2024".
// `expectedYear` is the year in the NTP code — the authoritative one; a
// handful of source rows have an obvious year typo ("June 1-15, 2026" on a
// 2025 NTP), so when the text year is within one year of the NTP's year we
// trust the NTP. Falls back to the RO-received date when the text can't be
// read at all.
function fromDate(d: Date): { key: string; label: string; yearFixed: boolean } {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  return {
    key: `${y}-${String(mo + 1).padStart(2, "0")}`,
    label: `${MONTHS[mo]} ${y}`,
    yearFixed: false,
  };
}

function monthFromPeriod(
  text: any,
  fallback: Date | null,
  expectedYear: number | null,
): { key: string; label: string; yearFixed: boolean } | null {
  if (text instanceof Date && !isNaN(text.getTime())) return fromDate(text);
  if (typeof text === "string") {
    const m = text.match(
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d.*?(20\d{2})/i,
    );
    if (m) {
      const idx = MONTHS.findIndex(
        (mm) => mm.toLowerCase() === m[1].slice(0, 3).toLowerCase(),
      );
      if (idx >= 0) {
        let yr = parseInt(m[2], 10);
        let yearFixed = false;
        if (expectedYear && yr !== expectedYear && Math.abs(yr - expectedYear) <= 1) {
          yr = expectedYear;
          yearFixed = true;
        }
        return {
          key: `${yr}-${String(idx + 1).padStart(2, "0")}`,
          label: `${MONTHS[idx]} ${yr}`,
          yearFixed,
        };
      }
    }
  }
  if (fallback) return fromDate(fallback);
  return null;
}

const UNDATED = { key: "9999-99", label: "Undated", yearFixed: false };

// Which half-month cut-off a payroll line falls in, from the first day number
// in the employment-period text: 1–15 -> "A", 16–end -> "B". A line whose
// period spans months is placed by its start day (same rule as the month).
function halfOfPeriod(text: any): "A" | "B" | null {
  if (text instanceof Date && !isNaN(text.getTime()))
    return text.getUTCDate() <= 15 ? "A" : "B";
  if (typeof text !== "string") return null;
  const m = text.match(
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})/i,
  );
  if (!m) return null;
  return parseInt(m[1], 10) <= 15 ? "A" : "B";
}

function cutoffLabel(monthLabel: string, half: "A" | "B"): string {
  // monthLabel is "Mar 2026" -> "Mar 1–15, 2026" / "Mar 16–end, 2026"
  const m = monthLabel.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return `${monthLabel} (${half === "A" ? "1–15" : "16–end"})`;
  return half === "A"
    ? `${m[1]} 1–15, ${m[2]}`
    : `${m[1]} 16–end, ${m[2]}`;
}

function yearInCode(ntp: string): number | null {
  const m = ntp.match(/-(\d{4})$/);
  return m ? parseInt(m[1], 10) : null;
}

interface DateCodedRow {
  ref: string; // the code cell, e.g. "B39"
  scope: string | null; // from that row's Province column, when readable
  seq: number; // the running NTP number in the column left of the code (0 if none)
  slots: number;
  fund: number;
  proponent: string;
  recoveredNtp?: string; // set when the code could be safely reconstructed
}

interface AllocationRead {
  allocations: Allocation[];
  sheetName: string;
  rowByNtp: Map<string, number>; // NTP code -> sheet row number (1-based)
  fundColLetter: string;
  codeColLetter: string;
  // Rows whose NTP-code cell holds a date (Excel auto-converted the code):
  // the allocation is real but the parser can't link it to a payroll.
  dateCoded: DateCodedRow[];
}

function readAllocations(
  ws: XLSX.WorkSheet,
  sheetName: string,
  warnings: string[],
): AllocationRead {
  const empty: AllocationRead = {
    allocations: [],
    sheetName,
    rowByNtp: new Map(),
    fundColLetter: "",
    codeColLetter: "",
    dateCoded: [],
  };
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "proponent", "salary");
  if (headerIdx === -1) {
    warnings.push(
      'The "Summary per NTP" sheet was found but its header row (Proponent / Salary) could not be located — allocations and slot targets will be blank.',
    );
    return empty;
  }
  const header = rows[headerIdx];
  const slotsCol = colByHeader(header, "no. of intern");
  const proponentCol = colByHeader(header, "proponent");
  const adlCol = colByHeader(header, "adl");
  const fundCol = colByHeader(header, "salary");
  const provinceCol = colByHeader(header, "province");
  // The NTP code sits in its own unlabeled column just left of "No. of
  // Intern" (or column B when that lookup fails).
  const codeCol = slotsCol > 0 ? slotsCol - 1 : 1;

  const out: Allocation[] = [];
  const rowByNtp = new Map<string, number>();
  const dateCoded: DateCodedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = row[codeCol];
    if (raw instanceof Date) {
      const slots = num(row[slotsCol]);
      const fund = num(row[fundCol]);
      const proponent =
        typeof row[proponentCol] === "string" ? row[proponentCol].trim() : "";
      // Ignore a stray date on an otherwise-empty row (a leftover placeholder).
      if (slots > 0 || fund > 0 || proponent)
        dateCoded.push({
          ref: cellRef(codeCol, i),
          scope: provinceCol >= 0 ? scopeFromProvince(row[provinceCol]) : null,
          seq: codeCol > 0 ? num(row[codeCol - 1]) : 0,
          slots,
          fund,
          proponent,
        });
      continue;
    }
    if (typeof raw !== "string") continue;
    const ntp = normalizeNtp(raw);
    if (!NTP_RE.test(ntp)) continue;
    const scope = scopeForNtp(ntp);
    if (!scope) continue;
    rowByNtp.set(ntp, i + 1);
    out.push({
      ntp,
      scope,
      proponent: typeof row[proponentCol] === "string" ? row[proponentCol].trim() : "",
      adl: typeof row[adlCol] === "string" ? row[adlCol].trim() : "",
      slots: num(row[slotsCol]),
      fund: num(row[fundCol]),
    });
  }
  // (No warning here — parseGipWorkbook decides, after trying to recover them.)
  return {
    allocations: out,
    sheetName,
    rowByNtp,
    fundColLetter: fundCol >= 0 ? XLSX.utils.encode_col(fundCol) : "",
    codeColLetter: XLSX.utils.encode_col(codeCol),
    dateCoded,
  };
}

// Row number(s) alone from a list of same-column A1 refs: ["B37","B38","B40"]
// -> "37–38, 40". Falls back to "" when the refs span more than one column.
function rowsFromRefs(refs: string[]): string {
  const cols = new Set(refs.map((r) => r.match(/^([A-Z]+)/)?.[1]));
  if (cols.size !== 1) return "";
  return condenseRefs(refs)
    .split(", ")
    .map((part) => part.replace(/[A-Z]+/g, "").replace(":", "–"))
    .join(", ");
}

interface DisbursementRead {
  disbursements: Disbursement[];
  sheetName: string;
  ntpColLetter: string;
  provinceColLetter: string;
  errorRefs: string[]; // #VALUE! / #REF! … cells
  mergedCodeCells: { ref: string; code: string }[]; // NTP-code cells holding a combined "07&08" code
}

function readDisbursements(
  ws: XLSX.WorkSheet,
  sheetName: string,
  warnings: string[],
): DisbursementRead {
  const rows = sheetToRows(ws);
  const base: DisbursementRead = {
    disbursements: [],
    sheetName,
    ntpColLetter: "",
    provinceColLetter: "",
    errorRefs: [],
    mergedCodeCells: [],
  };
  if (rows.length < 2) return base;
  const header = rows[0];
  const ntpCol = colByHeader(header, "ntp");
  const salaryCol = colByHeader(header, "salary"); // "SALARY" comes before "SALARY+SERVICE FEE"
  const rateCol = colByHeader(header, "rate per day");
  const internsCol = colByHeader(header, "intern");
  const provinceCol = colByHeader(header, "province");
  const periodCol = colByHeader(header, "employment period");
  const roCol = colByHeader(header, "ro received");
  const tssdCol = colByHeader(header, "tssd", "received");
  const eupCol = colByHeader(header, "eup");
  const remarksCol = colByHeader(header, "remarks");
  const mAdlCol = colByHeader(header, "adl");
  const partnerCol = colByHeader(header, "partner agency");
  if (ntpCol === -1 || salaryCol === -1) {
    warnings.push(
      'The "Monitoring" sheet was found but its NTP No. / SALARY columns could not be located — no disbursement figures could be read.',
    );
    return base;
  }

  const errorRefs = new Set<string>();
  const mergedCodeCells: { ref: string; code: string }[] = [];
  let yearTypos = 0;
  const out: Disbursement[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawNtp = row[ntpCol];
    if (typeof rawNtp !== "string" || !rawNtp.trim()) continue;
    const ntp = normalizeNtp(rawNtp);
    if (ntp.includes("&"))
      mergedCodeCells.push({ ref: cellRef(ntpCol, i), code: ntp });
    const salary = row[salaryCol];
    if (typeof salary === "string" && salary.startsWith("#")) {
      errorRefs.add(cellRef(salaryCol, i));
      continue;
    }
    if (typeof salary !== "number" || !isFinite(salary)) continue;

    let scope = scopeForNtp(ntp);
    if (!scope && provinceCol >= 0) scope = scopeFromProvince(row[provinceCol]);
    if (!scope) continue;

    const roReceived = roCol >= 0 ? asDate(row[roCol]) : null;
    const tssdReceived = tssdCol >= 0 ? asDate(row[tssdCol]) : null;
    const toEup = eupCol >= 0 ? asDate(row[eupCol]) : null;
    const mo =
      monthFromPeriod(
        periodCol >= 0 ? row[periodCol] : null,
        roReceived ?? tssdReceived ?? toEup,
        yearInCode(ntp),
      ) ?? UNDATED;
    if (mo.yearFixed) yearTypos++;
    const half = mo.key === UNDATED.key ? null : halfOfPeriod(row[periodCol]);
    out.push({
      ntp,
      scope,
      amount: salary,
      rate: rateCol >= 0 ? num(row[rateCol]) : 0,
      interns: num(row[internsCol]),
      month: mo.key,
      monthLabel: mo.label,
      cutoff: half ? `${mo.key}-${half}` : mo.key,
      cutoffLabel: half ? cutoffLabel(mo.label, half) : mo.label,
      roReceived,
      toEup,
      remarks: typeof row[remarksCol] === "string" ? row[remarksCol] : "",
      adl:
        mAdlCol >= 0 && row[mAdlCol] != null
          ? String(row[mAdlCol])
              .trim()
              .replace(/\s*&\s*|\s+and\s+/gi, " & ") // "X and Y" / "X&Y" -> "X & Y"
          : "",
      partner:
        partnerCol >= 0 && typeof row[partnerCol] === "string"
          ? row[partnerCol].trim()
          : "",
      provinceRaw:
        typeof row[provinceCol] === "string" ? row[provinceCol].trim() : "",
      row: i + 1,
    });
  }

  // Flag any #VALUE!/#REF! cells anywhere on the sheet, not just col I.
  for (let i = 0; i < rows.length; i++)
    for (let c = 0; c < rows[i].length; c++)
      if (
        typeof rows[i][c] === "string" &&
        /^#(VALUE|REF|NAME|DIV|N\/A|NUM|NULL)/i.test(rows[i][c])
      )
        errorRefs.add(cellRef(c, i));
  if (errorRefs.size > 0)
    warnings.push(
      `${errorRefs.size} error value(s) (#VALUE!, #REF! …) were found in the "Monitoring" sheet — the affected rows were skipped. These are usually corrupted date cells; re-enter them and re-upload.`,
    );
  if (mergedCodeCells.length > 0)
    warnings.push(
      'The "Monitoring" sheet records some payrolls under a merged NTP code (e.g. "MIMAROPA-07&08-2025"). Those are reported as a single combined line in the NTP breakdown.',
    );
  if (yearTypos > 0)
    warnings.push(
      `${yearTypos} payroll row(s) have an Employment Period year that disagrees with the NTP code's year (e.g. "June 1-15, 2026" on a 2025 NTP) — the NTP code's year was used for the month-by-month breakdown.`,
    );

  return {
    disbursements: out,
    sheetName,
    ntpColLetter: XLSX.utils.encode_col(ntpCol),
    provinceColLetter: provinceCol >= 0 ? XLSX.utils.encode_col(provinceCol) : "",
    errorRefs: [...errorRefs],
    mergedCodeCells,
  };
}

interface ScopeAgg {
  fundTarget: number;
  slotTarget: number;
  disbursed: number;
  peakInterns: number;
  lines: number;
  linesToEup: number;
  amountToEup: number;
  linesInProcess: number;
  amountInProcess: number;
  holdLines: number;
  holdAmount: number;
  holdReasons: Map<string, number>;
  lagDays: number[];
  rateCounts: Map<number, number>; // rate/day -> line count (0 excluded)
}

function emptyAgg(): ScopeAgg {
  return {
    fundTarget: 0,
    slotTarget: 0,
    disbursed: 0,
    peakInterns: 0,
    lines: 0,
    linesToEup: 0,
    amountToEup: 0,
    linesInProcess: 0,
    amountInProcess: 0,
    holdLines: 0,
    holdAmount: 0,
    holdReasons: new Map(),
    lagDays: [],
    rateCounts: new Map(),
  };
}

// Prevailing rate = the most-used non-zero rate; falls back to the scope's
// regional wage (SPES parity) when the sheet carried no rate at all.
function prevailingRate(
  counts: Map<number, number>,
  scope: string,
): { rate: number; fromFallback: boolean; secondary?: number } {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length)
    return { rate: fallbackRate(scope), fromFallback: true };
  return {
    rate: entries[0][0],
    fromFallback: false,
    secondary: entries[1]?.[0],
  };
}

const HOLD_REASONS: [RegExp, string][] = [
  [/justification/i, "pending justification letter"],
  [/notariz/i, "IA not notarised"],
  [/signature|unsigned|w\/o sign/i, "missing signatures"],
  [/\bdtr\b/i, "DTR issues"],
  [/\bar\b|attached ar|missing ar/i, "missing/attached AR"],
  [/correction|revised|recomput|underpay/i, "payroll correction"],
  [/verification|number of days|no\. of days/i, "day-count verification"],
];

function classifyHold(remarks: string): string {
  for (const [re, label] of HOLD_REASONS) if (re.test(remarks)) return label;
  return "other";
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function parseGipWorkbook(
  wb: XLSX.WorkBook,
): SpesParseResult & GenericBreakdowns {
  const warnings: string[] = [];
  const year = detectYear(wb);

  const summaryName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("summary per ntp")) ?? "";
  const monitoringName =
    wb.SheetNames.find(
      (n) =>
        n.toLowerCase().trim() === "monitoring" ||
        n.toLowerCase().includes("monitoring"),
    ) ?? "";
  const summarySheet = summaryName ? wb.Sheets[summaryName] : null;
  const monitoringSheet = monitoringName ? wb.Sheets[monitoringName] : null;

  if (!summarySheet)
    warnings.push(
      'No "Summary per NTP" sheet found — fund allocation and intern-slot targets will show as TBD.',
    );
  if (!monitoringSheet)
    warnings.push(
      'No "Monitoring" sheet found — disbursed stipend figures cannot be computed.',
    );

  const allocRead = summarySheet
    ? readAllocations(summarySheet, summaryName || "Summary per NTP", warnings)
    : null;
  const disbRead = monitoringSheet
    ? readDisbursements(monitoringSheet, monitoringName || "Monitoring", warnings)
    : null;
  const allocations = allocRead?.allocations ?? [];
  const disbursements = disbRead?.disbursements ?? [];

  if (summarySheet && allocations.length === 0)
    warnings.push(
      'The "Summary per NTP" sheet was found but no NTP allocation rows could be read (its layout may have changed).',
    );
  if (monitoringSheet && disbursements.length === 0)
    warnings.push(
      'The "Monitoring" sheet was found but no payroll rows could be read (its layout may have changed).',
    );

  // --- Recover date-coded allocation rows -------------------------------------
  // Excel turned some NTP-code cells into dates (the Marinduque data-entry
  // issue). Each such row still has a Province and a running number in the
  // column to its left, so the code can be rebuilt as PREFIX-NN-YEAR. We only
  // trust the rebuild when the exact code already exists in the Monitoring
  // sheet as payroll with no allocation — i.e. we're joining two loose ends
  // that clearly refer to the same NTP, never inventing a link.
  const dateCodedRows = allocRead?.dateCoded ?? [];
  if (dateCodedRows.length) {
    // Preferred prefix per scope = the one the real codes in this file use.
    const prefixVotes = new Map<string, Map<string, number>>();
    for (const src of [
      ...allocations.map((a) => ({ ntp: a.ntp, scope: a.scope })),
      ...disbursements.map((d) => ({ ntp: d.ntp, scope: d.scope })),
    ]) {
      const pfx = src.ntp.split("-")[0];
      if (!pfx || !src.scope) continue;
      if (!prefixVotes.has(src.scope)) prefixVotes.set(src.scope, new Map());
      const m = prefixVotes.get(src.scope)!;
      m.set(pfx, (m.get(pfx) ?? 0) + 1);
    }
    const prefixForScope = (scope: string): string | null => {
      const m = prefixVotes.get(scope);
      if (!m) return null;
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    // Year for the rebuilt code = the year most of the file's real codes use
    // (a workbook is one FY), falling back to the sheet-name year.
    const yearVotes = new Map<number, number>();
    for (const c of [
      ...allocations.map((a) => a.ntp),
      ...disbursements.map((d) => d.ntp),
    ]) {
      const y = yearInCode(c);
      if (y) yearVotes.set(y, (yearVotes.get(y) ?? 0) + 1);
    }
    const codeYear =
      [...yearVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? year;
    const allocCodes = new Set(allocations.map((a) => a.ntp));
    const disbCodes = new Set(disbursements.map((d) => d.ntp));
    for (const dc of dateCodedRows) {
      if (!dc.scope || dc.seq <= 0) continue;
      const pfx = prefixForScope(dc.scope);
      if (!pfx) continue;
      const code = `${pfx}-${String(dc.seq).padStart(2, "0")}-${codeYear}`;
      if (!disbCodes.has(code) || allocCodes.has(code)) continue;
      // Safe to link.
      dc.recoveredNtp = code;
      allocCodes.add(code);
      allocations.push({
        ntp: code,
        scope: dc.scope,
        proponent: dc.proponent,
        adl: "",
        slots: dc.slots,
        fund: dc.fund,
      });
    }
    const recovered = dateCodedRows.filter((d) => d.recoveredNtp).length;
    const loose = dateCodedRows.length - recovered;
    if (recovered > 0)
      warnings.push(
        `${recovered} allocation row(s) in "Summary per NTP" had their NTP code auto-converted to a date by Excel; the parser matched them back by province + row number, so their budget is counted. Re-type the codes as text to keep the file correct.`,
      );
    if (loose > 0)
      warnings.push(
        `${loose} allocation row(s) in "Summary per NTP" have a date where the NTP code should be and could not be matched — those allocations read as 0. Re-type the codes as text and re-upload.`,
      );
  }

  const allScopes = [...PROVINCES, RO_SCOPE];
  const aggs = new Map<string, ScopeAgg>();
  for (const s of allScopes) aggs.set(s, emptyAgg());
  const total = emptyAgg();

  // --- allocations → targets ---
  const allocByNtp = new Map<string, Allocation>();
  for (const a of allocations) {
    allocByNtp.set(a.ntp, a);
    const agg = aggs.get(a.scope);
    if (!agg) continue;
    agg.fundTarget += a.fund;
    agg.slotTarget += a.slots;
    total.fundTarget += a.fund;
    total.slotTarget += a.slots;
  }

  // --- disbursements → actuals ---
  const peakPerNtp = new Map<string, number>(); // max interns on any one line
  const disbursedPerNtp = new Map<string, number>();
  const adlByNtp = new Map<string, Set<string>>(); // NTP code -> distinct ADL No(s).
  const partnerByNtp = new Map<string, string>(); // NTP code -> Partner Agency (first seen)
  const rateVotesPerNtp = new Map<string, Map<number, number>>();
  const monthly = new Map<string, Map<string, PeriodicBucket>>(); // scope -> key -> bucket
  const monthlyTotal = new Map<string, PeriodicBucket>();
  const cutoff = new Map<string, Map<string, PeriodicBucket>>(); // half-month split
  const cutoffTotal = new Map<string, PeriodicBucket>();

  // NTP-level accumulators, one keyed by month, one by cut-off, so a bare
  // month key that turns up in the cut-off breakdown (a line with an unknown
  // half) never collides with the whole-month total.
  type SubAcc = Map<string, Map<string, { interns: number; amount: number }>>;
  const subAccMonthly = new Map<string, SubAcc>();
  const subAccFine = new Map<string, SubAcc>();
  const addSub = (
    into: Map<string, SubAcc>,
    scope: string,
    key: string,
    ntp: string,
    interns: number,
    amount: number,
  ) => {
    if (!into.has(scope)) into.set(scope, new Map());
    const byKey = into.get(scope)!;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const byNtp = byKey.get(key)!;
    const cur = byNtp.get(ntp) ?? { interns: 0, amount: 0 };
    cur.interns += interns;
    cur.amount += amount;
    byNtp.set(ntp, cur);
  };

  const bump = (
    m: Map<string, PeriodicBucket>,
    key: string,
    label: string,
    interns: number,
    amount: number,
  ) => {
    const b = m.get(key) ?? { bucket: key, label, primary: 0, secondary: 0 };
    b.primary += interns;
    b.secondary += amount;
    m.set(key, b);
  };

  for (const d of disbursements) {
    const agg = aggs.get(d.scope);
    if (!agg) continue;

    agg.disbursed += d.amount;
    agg.lines += 1;
    total.disbursed += d.amount;
    total.lines += 1;

    disbursedPerNtp.set(
      d.ntp,
      (disbursedPerNtp.get(d.ntp) ?? 0) + d.amount,
    );
    if (d.adl) {
      if (!adlByNtp.has(d.ntp)) adlByNtp.set(d.ntp, new Set());
      adlByNtp.get(d.ntp)!.add(d.adl);
    }
    if (d.partner && !partnerByNtp.has(d.ntp))
      partnerByNtp.set(d.ntp, d.partner);
    peakPerNtp.set(
      d.ntp,
      Math.max(peakPerNtp.get(d.ntp) ?? 0, d.interns),
    );
    if (d.rate > 0) {
      agg.rateCounts.set(d.rate, (agg.rateCounts.get(d.rate) ?? 0) + 1);
      total.rateCounts.set(d.rate, (total.rateCounts.get(d.rate) ?? 0) + 1);
      if (!rateVotesPerNtp.has(d.ntp)) rateVotesPerNtp.set(d.ntp, new Map());
      const rv = rateVotesPerNtp.get(d.ntp)!;
      rv.set(d.rate, (rv.get(d.rate) ?? 0) + 1);
    }

    if (d.toEup) {
      agg.linesToEup += 1;
      agg.amountToEup += d.amount;
      total.linesToEup += 1;
      total.amountToEup += d.amount;
      if (d.roReceived) {
        const days =
          (Date.UTC(
            d.toEup.getUTCFullYear(),
            d.toEup.getUTCMonth(),
            d.toEup.getUTCDate(),
          ) -
            Date.UTC(
              d.roReceived.getUTCFullYear(),
              d.roReceived.getUTCMonth(),
              d.roReceived.getUTCDate(),
            )) /
          86400000;
        if (days >= 0 && days <= 400) {
          agg.lagDays.push(days);
          total.lagDays.push(days);
        }
      }
    } else {
      agg.linesInProcess += 1;
      agg.amountInProcess += d.amount;
      total.linesInProcess += 1;
      total.amountInProcess += d.amount;
    }

    if (/hold/i.test(d.remarks)) {
      const reason = classifyHold(d.remarks);
      agg.holdLines += 1;
      agg.holdAmount += d.amount;
      agg.holdReasons.set(reason, (agg.holdReasons.get(reason) ?? 0) + 1);
      total.holdLines += 1;
      total.holdAmount += d.amount;
      total.holdReasons.set(reason, (total.holdReasons.get(reason) ?? 0) + 1);
    }

    if (!monthly.has(d.scope)) monthly.set(d.scope, new Map());
    bump(monthly.get(d.scope)!, d.month, d.monthLabel, d.interns, d.amount);
    bump(monthlyTotal, d.month, d.monthLabel, d.interns, d.amount);

    if (!cutoff.has(d.scope)) cutoff.set(d.scope, new Map());
    bump(cutoff.get(d.scope)!, d.cutoff, d.cutoffLabel, d.interns, d.amount);
    bump(cutoffTotal, d.cutoff, d.cutoffLabel, d.interns, d.amount);

    addSub(subAccMonthly, d.scope, d.month, d.ntp, d.interns, d.amount);
    addSub(subAccMonthly, REGION_TOTAL, d.month, d.ntp, d.interns, d.amount);
    addSub(subAccFine, d.scope, d.cutoff, d.ntp, d.interns, d.amount);
    addSub(subAccFine, REGION_TOTAL, d.cutoff, d.ntp, d.interns, d.amount);
  }

  for (const [ntp, peak] of peakPerNtp) {
    const scope = scopeForNtp(ntp);
    const agg = scope ? aggs.get(scope) : null;
    if (agg) agg.peakInterns += peak;
    total.peakInterns += peak;
  }

  // NTPs paid against with no usable allocation — either no row in "Summary
  // per NTP" at all, or a row that carries neither a fund figure nor a slot
  // count (a code placeholder the RO hasn't filled in yet).
  const hasRealAllocation = (ntp: string): boolean => {
    const a = allocByNtp.get(ntp);
    return !!a && (a.fund > 0 || a.slots > 0);
  };
  const unallocated: { ntp: string; amount: number; scope: string }[] = [];
  for (const [ntp, amount] of disbursedPerNtp) {
    if (hasRealAllocation(ntp)) continue;
    // The merged "07&08" code is covered when its individual rows carry figures.
    if (ntp.includes("&")) {
      const parts = ntp.split("-");
      const yr = parts[parts.length - 1];
      const nums = parts[1].split("&");
      const covered = nums.every((n) =>
        hasRealAllocation(`${parts[0]}-${n}-${yr}`),
      );
      if (covered) continue;
    }
    const scope = scopeForNtp(ntp);
    if (scope) unallocated.push({ ntp, amount, scope });
  }

  // --- build PeriodEntry per scope + the region total ---
  const periods: PeriodEntry[] = [];
  const subScopeBreakdown: Record<string, SubScopeRow[]> = {};
  const periodicBreakdown: Record<string, PeriodicBucket[]> = {};

  const buildEntry = (scope: string, agg: ScopeAgg): PeriodEntry => {
    const extraNotes: string[] = [];

    const pr = prevailingRate(agg.rateCounts, scope);
    if (pr.rate > 0) {
      const src = pr.fromFallback
        ? "no rate on the Monitoring sheet — regional wage used (SPES parity)"
        : "source: Monitoring Rate per Day";
      const older = pr.secondary
        ? ` (₱${pr.secondary.toLocaleString()}/day on earlier carry-over lines)`
        : "";
      extraNotes.push(
        `Daily rate (${src}): ₱${pr.rate.toLocaleString()}/day${older}.`,
      );
    }

    if (agg.lines > 0) {
      extraNotes.push(
        `Payroll pipeline (source: Monitoring sheet): ${agg.linesToEup} of ${agg.lines} lines forwarded to EUP (₱${Math.round(
          agg.amountToEup,
        ).toLocaleString()}); ${agg.linesInProcess} line(s) still in process (₱${Math.round(
          agg.amountInProcess,
        ).toLocaleString()}).`,
      );
    }
    if (agg.holdLines > 0) {
      const reasons = [...agg.holdReasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([r, c]) => `${r} (${c})`)
        .join(", ");
      extraNotes.push(
        `On HOLD (source: Monitoring Remarks): ${agg.holdLines} payroll line(s), ₱${Math.round(
          agg.holdAmount,
        ).toLocaleString()} — mostly ${reasons}.`,
      );
    }
    if (agg.lagDays.length > 0) {
      extraNotes.push(
        `Processing time, RO received → forwarded to EUP (source: Monitoring sheet): median ${median(
          agg.lagDays,
        ).toFixed(0)} days, average ${(
          agg.lagDays.reduce((s, x) => s + x, 0) / agg.lagDays.length
        ).toFixed(1)} days (n=${agg.lagDays.length}).`,
      );
    }

    // Over / near ceiling NTPs within this scope.
    const overCeiling: string[] = [];
    for (const [ntp, alloc] of allocByNtp) {
      if (alloc.scope !== scope || alloc.fund <= 0) continue;
      const used = disbursedPerNtp.get(ntp) ?? 0;
      const pct = (used / alloc.fund) * 100;
      if (pct >= 95)
        overCeiling.push(
          `${ntp} at ${pct.toFixed(1)}% (₱${Math.round(used).toLocaleString()} of ₱${Math.round(
            alloc.fund,
          ).toLocaleString()})`,
        );
    }
    if (overCeiling.length)
      extraNotes.push(
        `Over / near ceiling (source: Summary per NTP vs Monitoring): ${overCeiling.join("; ")}.`,
      );

    const scopeUnallocated = unallocated.filter((u) => u.scope === scope);
    if (scopeUnallocated.length) {
      const totalU = scopeUnallocated.reduce((s, u) => s + u.amount, 0);
      extraNotes.push(
        `Disbursed with no allocation row in "Summary per NTP" (source: Monitoring): ${scopeUnallocated
          .map(
            (u) => `${u.ntp} ₱${Math.round(u.amount).toLocaleString()}`,
          )
          .join(", ")} — total ₱${Math.round(
          totalU,
        ).toLocaleString()}. Allocation figures for these NTPs need to be encoded.`,
      );
    }

    const fundPlaceholder = agg.fundTarget <= 0;
    const slotPlaceholder = agg.slotTarget <= 0;

    return {
      year,
      label: `FY ${year}`,
      scope,
      metrics: [
        {
          key: "fund",
          label: "Stipend Fund",
          unit: "currency",
          target: fundPlaceholder ? null : agg.fundTarget,
          actual: agg.disbursed,
          isPlaceholder: fundPlaceholder,
          sourceSheet: "Summary per NTP / Monitoring",
        },
        {
          key: "interns",
          label: "Interns (peak on payroll)",
          unit: "count",
          target: slotPlaceholder ? null : agg.slotTarget,
          actual: agg.peakInterns,
          isPlaceholder: slotPlaceholder,
          sourceSheet: "Summary per NTP / Monitoring",
        },
      ],
      note:
        fundPlaceholder && agg.disbursed > 0
          ? "No allocation encoded for this scope yet — balance cannot be computed."
          : undefined,
      extraNotes: extraNotes.length ? extraNotes : undefined,
    };
  };

  // Split a merged code like "MIMAROPA-07&08-2025" into its siblings
  // ["MIMAROPA-07-2025", "MIMAROPA-08-2025"].
  const siblingsOf = (ntp: string): string[] => {
    const m = ntp.match(/^([A-Za-z]+)-([0-9]+(?:&[0-9]+)+)-([0-9]{4})$/);
    if (!m) return [];
    return m[2].split("&").map((n) => `${m[1]}-${n}-${m[3]}`);
  };

  const buildSubScope = (ntps: Set<string>): SubScopeRow[] => {
    // Monitoring logs some NTPs under one merged code (e.g. "…-07&08-…")
    // while the allocation sheet keeps them separate. Show a single row per
    // merged code that folds in its siblings, and hide those siblings.
    const hidden = new Set<string>();
    for (const ntp of ntps)
      for (const sib of siblingsOf(ntp)) hidden.add(sib);

    const rows: SubScopeRow[] = [];
    for (const ntp of [...ntps].sort()) {
      if (hidden.has(ntp)) continue;
      const members = [ntp, ...siblingsOf(ntp)];
      const alloc = members
        .map((m) => allocByNtp.get(m))
        .find((a): a is Allocation => !!a && (a.fund > 0 || a.slots > 0));
      const fund = members.reduce(
        (s, m) => s + (allocByNtp.get(m)?.fund ?? 0),
        0,
      );
      const slots = members.reduce(
        (s, m) => s + (allocByNtp.get(m)?.slots ?? 0),
        0,
      );
      const disbursed = members.reduce(
        (s, m) => s + (disbursedPerNtp.get(m) ?? 0),
        0,
      );
      // Rate: only from members that actually have payroll; blank otherwise.
      const rateVotes = new Map<number, number>();
      for (const m of members)
        for (const [r, c] of rateVotesPerNtp.get(m) ?? [])
          rateVotes.set(r, (rateVotes.get(r) ?? 0) + c);
      const rate = rateVotes.size
        ? prevailingRate(rateVotes, scopeForNtp(ntp) ?? "").rate
        : null;
      const noteBits = [alloc?.proponent, alloc?.adl && `ADL ${alloc.adl}`]
        .filter(Boolean)
        .join(" · ");
      rows.push({
        name: ntp,
        note: noteBits || undefined,
        values: [
          { label: "Rate/day", value: rate, unit: "currency" },
          { label: "Slots", value: slots, unit: "count" },
          { label: "Allocation", value: fund, unit: "currency" },
          { label: "Disbursed", value: disbursed, unit: "currency" },
          { label: "Balance", value: fund - disbursed, unit: "currency" },
        ],
      });
    }
    return rows;
  };

  const ntpsByScope = new Map<string, Set<string>>();
  for (const s of [...allScopes, REGION_TOTAL]) ntpsByScope.set(s, new Set());
  for (const ntp of new Set([...allocByNtp.keys(), ...disbursedPerNtp.keys()])) {
    const scope = scopeForNtp(ntp);
    if (scope) {
      ntpsByScope.get(scope)?.add(ntp);
      ntpsByScope.get(REGION_TOTAL)?.add(ntp);
    }
  }

  const periodicBreakdownFine: Record<string, PeriodicBucket[]> = {};
  const sortBuckets = (m: Map<string, PeriodicBucket>) =>
    [...m.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));

  // NTP-level detail per bucket, so a period row can expand.
  const buildSubRows = (
    acc: Map<string, SubAcc>,
  ): Record<string, Record<string, PeriodicSubRow[]>> => {
    const res: Record<string, Record<string, PeriodicSubRow[]>> = {};
    for (const [scope, byKey] of acc) {
      const out: Record<string, PeriodicSubRow[]> = {};
      for (const [key, byNtp] of byKey) {
        out[key] = [...byNtp.entries()]
          .map(([ntp, v]): PeriodicSubRow => {
            const adls = [...(adlByNtp.get(ntp) ?? [])];
            return {
              name: ntp,
              note: adls.length ? `ADL ${adls.join(", ")}` : undefined,
              primary: v.interns,
              secondary: v.amount,
            };
          })
          .sort((a, b) => b.secondary - a.secondary);
      }
      res[scope] = out;
    }
    return res;
  };
  const periodicSubRows = buildSubRows(subAccMonthly);
  const periodicSubRowsFine = buildSubRows(subAccFine);

  for (const scope of allScopes) {
    const agg = aggs.get(scope)!;
    if (agg.lines === 0 && agg.fundTarget === 0) continue; // nothing for this scope
    periods.push(buildEntry(scope, agg));
    subScopeBreakdown[scope] = buildSubScope(ntpsByScope.get(scope)!);
    const m = monthly.get(scope);
    if (m) periodicBreakdown[scope] = sortBuckets(m);
    const cm = cutoff.get(scope);
    if (cm) periodicBreakdownFine[scope] = sortBuckets(cm);
  }

  // Region-wide total row.
  if (total.lines > 0 || total.fundTarget > 0) {
    const totalEntry = buildEntry(REGION_TOTAL, total);
    totalEntry.note =
      "Region-wide total: the 5 provinces plus RO-administered NTPs. Computed from the uploaded file.";
    periods.push(totalEntry);
    subScopeBreakdown[REGION_TOTAL] = buildSubScope(
      ntpsByScope.get(REGION_TOTAL)!,
    );
    periodicBreakdown[REGION_TOTAL] = sortBuckets(monthlyTotal);
    periodicBreakdownFine[REGION_TOTAL] = sortBuckets(cutoffTotal);
  }

  if (periods.length === 0)
    warnings.push(
      "No GIP periods could be built from this file — check that it is the GIP Stipend Monitoring workbook.",
    );

  // ---- How the numbers were built (shown verbatim on the dashboard) ----
  const methodNotes = [
    "Allocation (target) = the “Salary” column of the Summary per NTP sheet, added up per province.",
    "Disbursed (actual) = the “SALARY” column of the Monitoring sheet, added up per province — every half-month payroll line.",
    "We total the Monitoring sheet ourselves. The Summary per NTP sheet’s own “Utilized” column is not used — its formula missed rows in older versions.",
    "Province comes from the NTP code (ORMIN-, OCCMIN-, MARQ-, ROM-, PAL-, MIMAROPA-), not the Province column, which has a few wrong entries.",
    "Stipend is paid twice a month (1–15, then 16–end of month). One NTP = 20–40 rows.",
    "A payroll line covering two months (e.g. “Sept 22 – Nov 30”) is counted once, in its start month — so the monthly totals still add up to the full total.",
    "“Interns (peak on payroll)” = the highest headcount on any single payroll line per NTP, added up. It is an estimate (no name list in the file) and is not the same as allocated slots.",
  ];

  // ---- Cross-sheet reconciliation findings ----
  // Each finding says which sheet to open, one line on how to fix it, and the
  // exact cells (or the missing rows) a reviewer should touch before the next
  // upload.
  const reconciliation: ReconciliationFinding[] = [];
  const summarySheetName = allocRead?.sheetName ?? "Summary per NTP";
  const monitoringSheetName = disbRead?.sheetName ?? "Monitoring";
  const rowByNtp = allocRead?.rowByNtp ?? new Map<string, number>();
  const fundCol = allocRead?.fundColLetter ?? "";
  const codeCol = allocRead?.codeColLetter ?? "";
  const provCol = disbRead?.provinceColLetter ?? "";
  const ntpCol = disbRead?.ntpColLetter ?? "";
  const colLabel = (name: string, letter: string) =>
    letter ? `${name} (column ${letter})` : name;
  const CELL_CAP = 40;

  // A merged code ("…-07&08-…") is legitimate GIP practice when both NTPs draw
  // from the same fund/ADL: the RO files one payroll for the two. Recognise
  // that case (all its payroll rows carry one ADL, and its sibling allocation
  // rows carry the same one) so it isn't flagged as a problem.
  const mergedLegit = new Map<string, string>(); // merged code -> the shared ADL
  {
    const byCode = new Map<string, Set<string>>();
    for (const d of disbursements) {
      if (!d.ntp.includes("&")) continue;
      if (!byCode.has(d.ntp)) byCode.set(d.ntp, new Set());
      if (d.adl) byCode.get(d.ntp)!.add(d.adl);
    }
    for (const [code, adls] of byCode) {
      if (adls.size !== 1) continue;
      const [adl] = [...adls];
      const sibs = siblingsOf(code);
      const sibAdls = sibs
        .map((s) => allocByNtp.get(s)?.adl?.trim())
        .filter((a): a is string => !!a);
      if (sibAdls.length === sibs.length && sibAdls.every((a) => a === adl))
        mergedLegit.set(code, adl);
    }
  }

  // Date-coded rows whose code could NOT be rebuilt — an unmatched NTP in one
  // of these scopes is probably one of them, so it gets a "code can't be
  // matched" note pointing at finding 2 instead of a plain "no row".
  const dateCoded = allocRead?.dateCoded ?? [];
  const looseDateScopes = new Set(
    dateCoded
      .filter((d) => !d.recoveredNtp)
      .map((d) => d.scope)
      .filter((s): s is string => !!s),
  );

  // 1) NTP has payroll but no usable allocation — no row, blank Salary, or a
  //    row that's there but unrecognisable because its code became a date.
  const noRow = unallocated
    .filter((u) => !u.ntp.includes("&"))
    .sort((a, b) => b.amount - a.amount);
  if (noRow.length) {
    const totalNoRow = noRow.reduce((s, u) => s + u.amount, 0);
    const anyExisting = noRow.some((u) => rowByNtp.has(u.ntp));
    const anyDateCoded = noRow.some(
      (u) => !rowByNtp.has(u.ntp) && looseDateScopes.has(u.scope),
    );
    const isPriorYear = (ntp: string) => {
      const y = yearInCode(ntp);
      return y != null && y < year;
    };
    const anyPriorYear = noRow.some(
      (u) => !rowByNtp.has(u.ntp) && isPriorYear(u.ntp),
    );
    reconciliation.push({
      severity: "warn",
      title: `${noRow.length} NTPs have payroll but no budget encoded — ₱${Math.round(
        totalNoRow,
      ).toLocaleString()} paid`,
      sheet: summarySheetName,
      column: colLabel("Salary", fundCol),
      fix:
        (anyExisting
          ? `For codes that show a row, fill in the Salary (and No. of Interns) on that row of the ${summarySheetName} sheet. `
          : "") +
        (anyDateCoded
          ? `For codes marked "code can't be matched", fix the date in the ${summarySheetName} sheet — see the "lost their NTP code" issue below; that also clears them here. `
          : "") +
        (anyPriorYear
          ? `Codes marked "${year - 1} carry-over" are from last year's program — their allocation lives in the ${year - 1} GIP workbook (or a "Continuing Fund" row here); add a row in this sheet only if the RO wants them tracked on the ${year} dashboard. `
          : "") +
        `For the rest marked "no row", add a new allocation row under the right province.`,
      detail:
        "These NTPs are paid in the Monitoring sheet but no allocation figure links to them in the Summary per NTP sheet, so their budget target reads as 0. Trace each one in the Monitoring sheet by its NTP No. + ADL No.",
      cells: noRow.slice(0, CELL_CAP).map((u) => {
        const adl = [...(adlByNtp.get(u.ntp) ?? [])].join(", ");
        const partner = partnerByNtp.get(u.ntp);
        return {
          ref:
            rowByNtp.has(u.ntp) && fundCol
              ? `${fundCol}${rowByNtp.get(u.ntp)}`
              : undefined,
          rows: rowByNtp.has(u.ntp) ? String(rowByNtp.get(u.ntp)) : undefined,
          label:
            u.ntp +
            (adl ? ` · ADL ${adl}` : "") +
            (partner ? ` · ${partner}` : ""),
          value: rowByNtp.has(u.ntp)
            ? "Salary cell is blank"
            : looseDateScopes.has(u.scope)
              ? `code can't be matched — see "lost their NTP code" (${u.scope})`
              : isPriorYear(u.ntp)
                ? `no row — ${year - 1} carry-over (${u.scope}); allocation is in the ${year - 1} workbook`
                : `no row — province: ${u.scope}`,
          amount: Math.round(u.amount),
        };
      }),
    });
  }

  // 2) Allocation rows whose NTP-code cell became a date. Rows the parser
  //    could rebuild (province + row number) and link to real payroll are
  //    treated as resolved and NOT listed here — only the ones still loose
  //    remain a "data issue" to fix.
  {
    const recovered = dateCoded.filter((d) => d.recoveredNtp);
    const stillLoose = dateCoded.filter((d) => !d.recoveredNtp);
    if (stillLoose.length) {
      const looseFund = stillLoose.reduce((s, d) => s + d.fund, 0);
      reconciliation.push({
        severity: "warn",
        title:
          `${stillLoose.length} allocation row${stillLoose.length === 1 ? " lost its" : "s lost their"} NTP code (Excel stored a date)` +
          (looseFund
            ? ` — ₱${Math.round(looseFund).toLocaleString()} of budget not linked`
            : ""),
        sheet: summarySheetName,
        column: colLabel("NTP code", codeCol),
        fix: `Re-type the NTP code as text in each cell below (type an apostrophe first, e.g. 'MARQ-03-2025). Excel auto-converted it into a date and the parser couldn't work out which NTP it is, so the budget on that row isn't counted.`,
        detail:
          (recovered.length
            ? `(${recovered.length} other date-coded row${recovered.length === 1 ? " was" : "s were"} matched back automatically and are already counted — not shown here.) `
            : "") +
          'These are real budget rows — Province, slots and Salary are filled, only the code cell is broken.',
        cells: stillLoose.slice(0, CELL_CAP).map((d) => ({
          ref: d.ref,
          rows: d.ref.replace(/[A-Z]+/g, ""),
          label: `Row ${d.ref.replace(/[A-Z]+/g, "")}`,
          value:
            "not linked" +
            (d.proponent ? ` · ${d.proponent}` : "") +
            (d.slots ? ` · ${d.slots} slot${d.slots === 1 ? "" : "s"}` : ""),
          amount: d.fund ? Math.round(d.fund) : undefined,
        })),
      });
    }
  }

  // 3) Allocation row with a figure but no matching payroll.
  const orphanAlloc: { ntp: string; fund: number; merged: boolean }[] = [];
  for (const [ntp, a] of allocByNtp) {
    if (a.fund <= 0 && a.slots <= 0) continue;
    if ((disbursedPerNtp.get(ntp) ?? 0) > 0) continue;
    // Covered — and correctly so — by a legitimate merged code (same ADL).
    if (
      [...mergedLegit.keys()].some((k) => siblingsOf(k).includes(ntp))
    )
      continue;
    const merged = [...disbursedPerNtp.keys()].some(
      (k) => k.includes("&") && siblingsOf(k).includes(ntp),
    );
    orphanAlloc.push({ ntp, fund: a.fund, merged });
  }
  if (orphanAlloc.length)
    reconciliation.push({
      severity: "warn",
      title: `${orphanAlloc.length} NTPs have a budget row but no payroll`,
      sheet: summarySheetName,
      column: colLabel("NTP code", codeCol),
      fix: `The cell below is the budget row. Check the ${monitoringSheetName} sheet for that code's payroll — it is usually logged under a different (often merged) NTP code, or the internship simply hasn't started.`,
      detail:
        "The allocation is counted in the target; the actual disbursement for these codes is 0 (or sits under a merged code).",
      cells: orphanAlloc.slice(0, CELL_CAP).map((o) => ({
        ref:
          rowByNtp.has(o.ntp) && codeCol
            ? `${codeCol}${rowByNtp.get(o.ntp)}`
            : undefined,
        rows: rowByNtp.has(o.ntp) ? String(rowByNtp.get(o.ntp)) : undefined,
        label: o.ntp,
        value: o.merged ? "payroll is under a merged code" : "no payroll found",
        amount: Math.round(o.fund),
      })),
    });

  // 4) Disbursed more than allocated.
  const over: { ntp: string; disbursed: number; fund: number; adl: string }[] =
    [];
  for (const [ntp, a] of allocByNtp) {
    const d = disbursedPerNtp.get(ntp) ?? 0;
    if (a.fund > 0 && d > a.fund + 1)
      over.push({ ntp, disbursed: d, fund: a.fund, adl: a.adl });
  }
  if (over.length)
    reconciliation.push({
      severity: "error",
      title: `${over.length} NTP over budget`,
      sheet: summarySheetName,
      column: colLabel("Salary", fundCol),
      fix: `Confirm the allocation figure in the cell below, then in the ${monitoringSheetName} sheet filter the NTP No. column to this code (and its ADL No.) and check the payroll lines for a double-encoded or wrong-NTP row.`,
      detail:
        "Disbursed stipend exceeds the encoded allocation. Either the allocation is understated or a payroll line is charged to the wrong NTP.",
      cells: over.slice(0, CELL_CAP).map((o) => ({
        ref: rowByNtp.has(o.ntp) && fundCol ? `${fundCol}${rowByNtp.get(o.ntp)}` : undefined,
        rows: rowByNtp.has(o.ntp) ? String(rowByNtp.get(o.ntp)) : undefined,
        label: o.adl ? `${o.ntp} · ADL ${o.adl}` : o.ntp,
        value: `₱${Math.round(o.disbursed).toLocaleString()} paid vs ₱${Math.round(
          o.fund,
        ).toLocaleString()} allocated`,
        amount: Math.round(o.disbursed - o.fund),
      })),
    });

  // 5) Province column vs NTP-code prefix — a fixable column mismatch.
  // Grouped by (NTP, province typed) so all the rows sharing one mistake read
  // as a single line with a cell range.
  const provGroups = new Map<string, { ntp: string; province: string; refs: string[] }>();
  let provRowCount = 0;
  for (const d of disbursements) {
    if (!d.provinceRaw) continue;
    const byCol = scopeFromProvince(d.provinceRaw);
    if (byCol && byCol !== d.scope) {
      provRowCount++;
      const key = `${d.ntp}||${d.provinceRaw}`;
      if (!provGroups.has(key))
        provGroups.set(key, { ntp: d.ntp, province: d.provinceRaw, refs: [] });
      if (provCol) provGroups.get(key)!.refs.push(`${provCol}${d.row}`);
    }
  }
  if (provGroups.size) {
    const ntps = new Set([...provGroups.values()].map((g) => g.ntp));
    reconciliation.push({
      severity: "warn",
      title: `${provRowCount} rows: Province column doesn't match the NTP code (${ntps.size} ${ntps.size === 1 ? "NTP" : "NTPs"})`,
      sheet: monitoringSheetName,
      column: colLabel("Province", provCol),
      fix: `In the ${colLabel("Province", provCol)} of the ${monitoringSheetName} sheet, on the rows listed, set the value to the province that matches the NTP-code prefix (e.g. an "ORMIN-…" code → "ORMIN"). Totals already follow the code, so this is a tidy-up, not a number fix.`,
      detail:
        "The dashboard keys every figure off the NTP code, so the province mismatch does not change any total — it is only confusing in the raw sheet.",
      cells: [...provGroups.values()].slice(0, CELL_CAP).map((g) => ({
        ref: g.refs.length ? condenseRefs(g.refs) : undefined,
        rows: rowsFromRefs(g.refs) || undefined,
        label: g.ntp,
        value: `Province says "${g.province}"`,
      })),
    });
  }

  // 6) One code covers two NTPs (merged "07&08"). Only a concern when the two
  //    NTPs *don't* share an ADL / fund source — a same-ADL merge is standard
  //    GIP practice (one payroll for the two) and isn't listed here.
  if (disbRead?.mergedCodeCells.length) {
    const byCode = new Map<string, string[]>();
    for (const { ref, code } of disbRead.mergedCodeCells) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(ref);
    }
    for (const [code, adl] of mergedLegit)
      methodNotes.push(
        `${code}: the two NTPs share ADL "${adl}", so the RO files one payroll for both. The dashboard shows them as a single line and adds their two budget rows — this is expected.`,
      );
    const flagged = [...byCode.entries()].filter(
      ([code]) => !mergedLegit.has(code),
    );
    const flaggedRows = flagged.reduce((s, [, refs]) => s + refs.length, 0);
    if (flagged.length) {
      reconciliation.push({
        severity: "info",
        title:
          flagged.length === 1
            ? `${flaggedRows} payroll rows use the combined code ${flagged[0][0]}`
            : `${flaggedRows} payroll rows use a combined NTP code (${flagged.length} codes)`,
        sheet: monitoringSheetName,
        column: colLabel("NTP No.", ntpCol),
        fix: `These two NTPs don't share an ADL / fund source, so consider splitting each listed row in the ${colLabel("NTP No.", ntpCol)} of the ${monitoringSheetName} sheet into one row per NTP number. If you leave it, the dashboard reports them as a single combined line and adds the two budget rows together.`,
        detail:
          'Codes like "MIMAROPA-07&08-2025" bundle two NTPs into one payroll line.',
        cells: flagged.map(([code, refs]) => ({
          ref: condenseRefs(refs),
          rows: rowsFromRefs(refs) || undefined,
          label: code,
        })),
      });
    }
  }

  // 7) Formula-error cells that forced rows to be skipped.
  if (disbRead?.errorRefs.length)
    reconciliation.push({
      severity: "error",
      title: `${disbRead.errorRefs.length} cells contain a formula error (#VALUE!, #REF! …)`,
      sheet: monitoringSheetName,
      fix: `Open each cell below and re-enter the value — these are usually a broken date or a formula pointing at a deleted cell. Rows with an error in the SALARY column were skipped, so their stipend is missing from the totals.`,
      detail:
        "Error cells cannot be read, so any payroll line that depends on one is left out of the disbursed figure.",
      cells: [{ ref: condenseRefs(disbRead.errorRefs), label: "cells to re-enter" }],
    });

  if (reconciliation.length === 0)
    reconciliation.push({
      severity: "info",
      title: "The two sheets match",
      detail:
        "Every NTP with payroll has a budget row, nothing is over budget, and the Province column agrees with the NTP codes.",
    });

  // Errors first, then warnings, then info — most actionable at the top.
  const sevOrder = { error: 0, warn: 1, info: 2 } as const;
  reconciliation.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return {
    periods,
    warnings,
    quarterly: {},
    unutilizedFunds: [],
    lguRates: {},
    periodicBreakdown,
    periodicBreakdownFine,
    periodicSubRows,
    periodicSubRowsFine,
    subScopeBreakdown,
    breakdownLabels: {
      periodic: "Month-by-month disbursement",
      periodicCoarse: "Monthly",
      periodicFine: "By cut-off",
      subScope: "NTP breakdown",
      periodicPrimary: "Interns on payroll",
      periodicSecondary: "Disbursed",
      subScopeCaption:
        "Utilisation recomputed from the full Monitoring sheet. A negative balance means disbursements have passed the encoded allocation — or that no allocation has been encoded for that NTP yet.",
      periodicSourceLabel: "each payroll's employment period",
      periodicRowNoun: "NTPs paid",
      periodicMatrixCaption:
        'Each payroll line is placed in the month of its employment period (Monitoring sheet); lines with no period or processing date are grouped as "Undated". "Amount disbursed" is column I (SALARY); the Total column is the region-wide sum, and column / row totals reconcile to each province\'s dashboard figure.',
    },
    methodNotes,
    reconciliation,
  };
}
