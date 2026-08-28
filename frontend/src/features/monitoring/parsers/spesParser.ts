import * as XLSX from "xlsx";
import type { PeriodEntry } from "../data/mockMonitoring";

function findSheet(
  wb: XLSX.WorkBook,
  matcher: (name: string) => boolean,
): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find(matcher);
  return name ? wb.Sheets[name] : null;
}

function sheetToRows(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
}

const PROVINCE_ALIASES: Record<string, string> = {
  "OR. MINDORO": "Oriental Mindoro",
  "ORIENTAL MINDORO": "Oriental Mindoro",
  "OCC. MINDORO": "Occidental Mindoro",
  "OCCIDENTAL MINDORO": "Occidental Mindoro",
  MARINDUQUE: "Marinduque",
  ROMBLON: "Romblon",
  PALAWAN: "Palawan",
};

function normalizeProvince(raw: string): string {
  const key = raw.trim().toUpperCase();
  return PROVINCE_ALIASES[key] ?? raw.trim();
}

const VALID_PROVINCES = new Set([
  "Oriental Mindoro",
  "Occidental Mindoro",
  "Marinduque",
  "Romblon",
  "Palawan",
]);

function detectYear(wb: XLSX.WorkBook): number {
  for (const name of wb.SheetNames) {
    const match = name.match(/(20\d{2})/);
    if (match) return parseInt(match[1], 10);
  }
  return new Date().getFullYear();
}

function findHeaderRow(rows: any[][], ...mustIncludeAll: string[]): number {
  return rows.findIndex((r) =>
    mustIncludeAll.every((needle) =>
      r.some((c) => typeof c === "string" && c.toLowerCase().includes(needle)),
    ),
  );
}

function lc(v: any): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

// Resolve a column by matching its header text instead of hard-coding a
// numeric index. A future logsheet that inserts or removes a column then
// shifts nothing downstream — the lookup follows the label. All needles
// must appear in the same header cell; returns -1 when nothing matches
// (callers treat that as "this sheet's layout changed" and bail out).
function colByHeader(header: any[], ...needles: string[]): number {
  return header.findIndex((h) => {
    const v = lc(h);
    return v !== "" && needles.every((n) => v.includes(n));
  });
}

function excelValueToDate(value: any): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number")
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  return null;
}

function sumStudentsByProvince(ws: XLSX.WorkSheet | null): Map<string, number> {
  const result = new Map<string, number>();
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "province", "no. of students");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx].map((h) =>
    typeof h === "string" ? h.trim().toLowerCase() : "",
  );
  const provinceCol = header.findIndex((h) => h.includes("province"));
  const studentsCol = header.findIndex(
    (h) => h.includes("no. of students") || h.includes("students"),
  );

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;
    const students =
      typeof row[studentsCol] === "number" ? row[studentsCol] : 0;
    result.set(province, (result.get(province) ?? 0) + students);
  }
  return result;
}

function getDailyRatesByProvince(wb: XLSX.WorkBook): Map<string, number> {
  const result = new Map<string, number>();
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("hiring rate"));
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "daily rate", "lgu");
  if (headerIdx === -1) return result;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[1];
    const rate = row[4];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (VALID_PROVINCES.has(province) && typeof rate === "number") {
      result.set(province, rate);
    }
  }
  return result;
}

export interface LguRateEntry {
  lgu: string;
  rate: number;
}

function getLguHiringRates(wb: XLSX.WorkBook): Map<string, LguRateEntry[]> {
  const result = new Map<string, LguRateEntry[]>();
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("hiring rate"));
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "daily rate", "lgu");
  if (headerIdx === -1) return result;

  let currentProvince: string | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const colA = row[0];
    const colB = row[1];
    const rate = row[4];

    // Section header row: No. column empty, LGU column has a label,
    // and no rate — this marks a new group ("Provincial Government",
    // "City", or a province name like "Marinduque").
    if (colA === null && typeof colB === "string" && colB.trim()) {
      const label = colB.trim();
      const normalized = normalizeProvince(label);
      currentProvince = VALID_PROVINCES.has(normalized) ? normalized : null;
      continue;
    }

    // Data row under a recognized province section: a real municipality
    // entry with its own daily rate.
    if (
      currentProvince &&
      typeof colB === "string" &&
      colB.trim() &&
      typeof rate === "number"
    ) {
      const existing = result.get(currentProvince) ?? [];
      existing.push({ lgu: colB.trim(), rate });
      result.set(currentProvince, existing);
    }
  }
  return result;
}

interface CounterpartTotals {
  count: number;
  gpaiProcessed: number;
}

function get100PercentCounterpart(
  wb: XLSX.WorkBook,
): Map<string, CounterpartTotals> {
  const result = new Map<string, CounterpartTotals>();
  const ws = findSheet(
    wb,
    (n) =>
      n.toLowerCase().includes("100%") &&
      n.toLowerCase().includes("counterpart"),
  );
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "province", "gpai processed");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx].map((h) =>
    typeof h === "string" ? h.trim().toLowerCase() : "",
  );
  const provinceCol = header.findIndex((h) => h.includes("province"));
  const gpaiCol = header.findIndex((h) => h.includes("gpai processed"));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;
    const existing = result.get(province) ?? { count: 0, gpaiProcessed: 0 };
    existing.count += 1;
    const gpaiVal = row[gpaiCol];
    if (typeof gpaiVal === "string" && gpaiVal.trim().toLowerCase() === "yes")
      existing.gpaiProcessed += 1;
    result.set(province, existing);
  }
  return result;
}

export interface UnutilizedFundEntry {
  lgu: string;
  startingBalance: number | null;
  remainingBalance: number | null;
}

function getUnutilizedFundsList(wb: XLSX.WorkBook): UnutilizedFundEntry[] {
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("unutilized"));
  const out: UnutilizedFundEntry[] = [];
  if (!ws) return out;
  const rows = sheetToRows(ws);

  // This sheet stacks several small side-by-side tables. Only the one headed
  // "Starting Bal" / "Remaining Bal" holds real fund figures. A separate
  // table further down is headed "Benef" / "No. of days" / "DOLE
  // Counterpart" and its numeric columns sit in the same spots — so an
  // unbounded scan used to pull rows like "LGU Bulalacao 15 -> 20" (a
  // beneficiary count and a day count) in as fake fund balances. Bound the
  // scan: start just below the balance header, stop at the next table.
  const headerRow = rows.findIndex((r) =>
    r.some((c) => lc(c).includes("starting bal")),
  );
  if (headerRow === -1) return out;

  const isNextTableHeader = (r: any[]): boolean =>
    r.some((c) => {
      const v = lc(c);
      return (
        v === "benef" ||
        v.includes("no. of days") ||
        v.includes("dole counterpart")
      );
    });

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isNextTableHeader(row)) break;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (
        typeof cell === "string" &&
        cell.trim() &&
        !cell.toLowerCase().includes("bal") &&
        !cell.toLowerCase().includes("benef")
      ) {
        const startingBal = row[c + 1];
        const remainingBal = row[c + 2];
        if (typeof startingBal === "number") {
          out.push({
            lgu: cell.trim(),
            startingBalance: startingBal,
            remainingBalance:
              typeof remainingBal === "number" ? remainingBal : null,
          });
        }
      }
    }
  }
  return out;
}

export interface QuarterlyActual {
  quarter: string;
  beneficiaries: number;
  fund: number;
}

function excelDateToQuarter(value: any): string | null {
  const date = excelValueToDate(value);
  if (!date || isNaN(date.getTime())) return null;
  const month = date.getUTCMonth();
  if (month <= 2) return "Q1";
  if (month <= 5) return "Q2";
  if (month <= 8) return "Q3";
  return "Q4";
}

interface ProvinceQuarterTotals {
  beneficiaries: number;
  fund: number;
}

interface QuarterlyResultMap {
  [province: string]: { [quarter: string]: ProvinceQuarterTotals };
}

export function deriveQuarterlyActuals(
  wb: XLSX.WorkBook,
): Record<string, QuarterlyActual[]> {
  const paymentSheet = findSheet(wb, (n) =>
    n.toLowerCase().includes("payment"),
  );
  const result: QuarterlyResultMap = {};
  if (!paymentSheet) return {};
  const rows = sheetToRows(paymentSheet);
  const headerIdx = findHeaderRow(rows, "province", "beneficiaries");
  if (headerIdx === -1) return {};
  const header = rows[headerIdx].map((h) =>
    typeof h === "string" ? h.trim().toLowerCase() : "",
  );
  const provinceCol = header.findIndex((h) => h.includes("province"));
  const dateCol = header.findIndex((h) => h.includes("date received"));
  const beneficiariesCol = header.findIndex((h) => h.includes("beneficiaries"));
  const totalAmountCol = header.findIndex((h) => h.includes("total amount"));
  const amountPaidColQ = header.findIndex((h) => h.includes("amount paid"));

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    const quarter = excelDateToQuarter(row[dateCol]);
    if (!quarter) continue;
    const benef =
      typeof row[beneficiariesCol] === "number" ? row[beneficiariesCol] : 0;
    const amt =
      typeof row[totalAmountCol] === "number"
        ? row[totalAmountCol]
        : typeof row[amountPaidColQ] === "number"
          ? row[amountPaidColQ]
          : 0;
    if (!result[province]) result[province] = {};
    if (!result[province][quarter])
      result[province][quarter] = { beneficiaries: 0, fund: 0 };
    result[province][quarter].beneficiaries += benef;
    result[province][quarter].fund += amt;
  }
  const final: Record<string, QuarterlyActual[]> = {};
  for (const province in result) {
    final[province] = Object.entries(result[province])
      .map(([quarter, v]) => ({ quarter, ...v }))
      .sort((a, b) => a.quarter.localeCompare(b.quarter));
  }
  return final;
}

// --- A) Documents & Insurance status (Placement sheet) ---
interface DocInsuranceStatus {
  docsYes: number;
  docsNo: number;
  gsisYes: number;
  totalChecked: number;
}

function getDocumentsInsuranceStatus(
  wb: XLSX.WorkBook,
): Map<string, DocInsuranceStatus> {
  const result = new Map<string, DocInsuranceStatus>();
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("placement"));
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "province", "complete documents");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx];
  const provinceCol = colByHeader(header, "province");
  const docsCol = colByHeader(header, "complete documents");
  const gsisCol = colByHeader(header, "gsis");
  if (provinceCol === -1 || docsCol === -1 || gsisCol === -1) return result;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;

    const existing = result.get(province) ?? {
      docsYes: 0,
      docsNo: 0,
      gsisYes: 0,
      totalChecked: 0,
    };
    const docsVal = row[docsCol]; // Complete Documents (Yes/No)
    const gsisVal = row[gsisCol]; // GSIS Insurance Form (Yes/No)

    let checkedThisRow = false;
    if (typeof docsVal === "string") {
      const v = docsVal.trim().toLowerCase();
      if (v === "yes") {
        existing.docsYes += 1;
        checkedThisRow = true;
      } else if (v === "no") {
        existing.docsNo += 1;
        checkedThisRow = true;
      }
    }
    if (
      typeof gsisVal === "string" &&
      gsisVal.trim().toLowerCase().startsWith("yes")
    ) {
      existing.gsisYes += 1;
      checkedThisRow = true;
    }
    if (checkedThisRow) existing.totalChecked += 1;
    result.set(province, existing);
  }
  return result;
}

// --- B) Payment processed status (Payment sheet) ---
function getPaymentProcessedCount(wb: XLSX.WorkBook): Map<string, number> {
  const result = new Map<string, number>();
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("payment"));
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "province", "processed");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx];
  const provinceCol = colByHeader(header, "province");
  const processedCol = colByHeader(header, "processed");
  if (provinceCol === -1 || processedCol === -1) return result;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;
    const processedVal = row[processedCol]; // Processed (Yes/No)
    if (
      typeof processedVal === "string" &&
      processedVal.trim().toLowerCase() === "yes"
    ) {
      result.set(province, (result.get(province) ?? 0) + 1);
    }
  }
  return result;
}

// --- C) LGU/Employer vs. DOLE Counterpart split (Pledge sheet) ---
interface CounterpartSplit {
  lguCounterpart: number;
  doleCounterpart: number;
}

function getCounterpartSplit(
  ws: XLSX.WorkSheet | null,
): Map<string, CounterpartSplit> {
  const result = new Map<string, CounterpartSplit>();
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "province", "counterpart");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx];
  const provinceCol = colByHeader(header, "province");
  const lguCol = colByHeader(header, "lgu", "counterpart");
  const doleCol = colByHeader(header, "dole", "counterpart");
  if (provinceCol === -1 || lguCol === -1 || doleCol === -1) return result;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;
    const lgu = typeof row[lguCol] === "number" ? row[lguCol] : 0;
    const dole = typeof row[doleCol] === "number" ? row[doleCol] : 0;
    const existing = result.get(province) ?? {
      lguCounterpart: 0,
      doleCounterpart: 0,
    };
    existing.lguCounterpart += lgu;
    existing.doleCounterpart += dole;
    result.set(province, existing);
  }
  return result;
}

// --- D) Processing speed: Date Received -> Date Submitted to ADMIN (Payment sheet) ---
interface ProcessingSpeed {
  totalDays: number;
  count: number;
}

function getProcessingSpeed(wb: XLSX.WorkBook): Map<string, ProcessingSpeed> {
  const result = new Map<string, ProcessingSpeed>();
  const ws = findSheet(wb, (n) => n.toLowerCase().includes("payment"));
  if (!ws) return result;
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "date received", "date submitted");
  if (headerIdx === -1) return result;
  const header = rows[headerIdx];
  const provinceCol = colByHeader(header, "province");
  const receivedCol = colByHeader(header, "date received");
  const submittedCol = colByHeader(header, "date submitted");
  if (provinceCol === -1 || receivedCol === -1 || submittedCol === -1)
    return result;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const provinceRaw = row[provinceCol];
    if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
    const province = normalizeProvince(provinceRaw);
    if (!VALID_PROVINCES.has(province)) continue;

    const received = excelValueToDate(row[receivedCol]);
    const submitted = excelValueToDate(row[submittedCol]);
    if (!received || !submitted) continue;
    const days = (submitted.getTime() - received.getTime()) / 86400000;
    if (days < 0 || days > 365) continue; // sanity guard against bad/reversed dates

    const existing = result.get(province) ?? { totalDays: 0, count: 0 };
    existing.totalDays += days;
    existing.count += 1;
    result.set(province, existing);
  }
  return result;
}

export interface SpesParseResult {
  periods: PeriodEntry[];
  warnings: string[];
  quarterly: Record<string, QuarterlyActual[]>;
  unutilizedFunds: UnutilizedFundEntry[];
  lguRates: Record<string, LguRateEntry[]>;
}

interface AmountTotals {
  beneficiaries: number;
  fund: number;
}

export function parseSpesWorkbook(wb: XLSX.WorkBook): SpesParseResult {
  const warnings: string[] = [];
  const year = detectYear(wb);

  const targetSheet = findSheet(wb, (n) =>
    n.toLowerCase().includes("distribution of target"),
  );
  const placementSheet = findSheet(wb, (n) =>
    n.toLowerCase().includes("placement"),
  );
  const paymentSheet = findSheet(wb, (n) =>
    n.toLowerCase().includes("payment"),
  );
  const pledgeSheet = findSheet(
    wb,
    (n) =>
      n.toLowerCase().includes("pledge") &&
      !n.toLowerCase().includes("supplemental"),
  );
  const supplementalSheet = findSheet(wb, (n) =>
    n.toLowerCase().includes("supplemental"),
  );

  if (!targetSheet)
    warnings.push(
      'Could not find a "Distribution of Target" sheet — targets will show as TBD.',
    );
  if (!paymentSheet)
    warnings.push(
      'Could not find a "Payment" sheet — paid figures cannot be computed.',
    );
  if (!placementSheet)
    warnings.push(
      'Could not find a "Placement" sheet — placed figures cannot be computed.',
    );
  if (!pledgeSheet)
    warnings.push(
      'Could not find a "Pledge" sheet — pledged figures cannot be computed.',
    );

  interface TargetInfo {
    target: number;
    fund: number;
  }
  const targets = new Map<string, TargetInfo>();
  if (targetSheet) {
    const rows = sheetToRows(targetSheet);
    for (const row of rows) {
      const province = row[0];
      const target = row[1];
      const fund = row[2];
      if (typeof province === "string") {
        const normalized = normalizeProvince(province.trim());
        if (VALID_PROVINCES.has(normalized) && typeof target === "number") {
          targets.set(normalized, {
            target,
            fund: typeof fund === "number" ? fund : 0,
          });
        }
      }
    }
  }

  const paidActuals = new Map<string, AmountTotals>();
  if (paymentSheet) {
    const rows = sheetToRows(paymentSheet);
    const headerIdx = findHeaderRow(rows, "province", "date received");
    if (headerIdx === -1) {
      warnings.push('Payment sheet found, but no "Province" column detected.');
    } else {
      const header = rows[headerIdx].map((h) =>
        typeof h === "string" ? h.trim().toLowerCase() : "",
      );
      const provinceCol = header.findIndex((h) => h.includes("province"));
      const beneficiariesCol = header.findIndex(
        (h) =>
          h.includes("no. of beneficiaries") || h.includes("beneficiaries"),
      );
      const totalAmountCol = header.findIndex((h) =>
        h.includes("total amount"),
      );
      const amountPaidCol = header.findIndex((h) => h.includes("amount paid"));
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const provinceRaw = row[provinceCol];
        if (typeof provinceRaw !== "string" || !provinceRaw.trim()) continue;
        const province = normalizeProvince(provinceRaw);
        const benef =
          typeof row[beneficiariesCol] === "number" ? row[beneficiariesCol] : 0;
        const amt =
          typeof row[totalAmountCol] === "number"
            ? row[totalAmountCol]
            : typeof row[amountPaidCol] === "number"
              ? row[amountPaidCol]
              : 0;
        const existing = paidActuals.get(province) ?? {
          beneficiaries: 0,
          fund: 0,
        };
        existing.beneficiaries += benef;
        existing.fund += amt;
        paidActuals.set(province, existing);
      }
    }
  }

  const placedActuals = sumStudentsByProvince(placementSheet);
  const pledgedActuals = sumStudentsByProvince(pledgeSheet);
  const supplementalActuals = sumStudentsByProvince(supplementalSheet);

  const dailyRates = getDailyRatesByProvince(wb);
  const lguRatesMap = getLguHiringRates(wb);
  const counterpartData = get100PercentCounterpart(wb);
  const unutilizedFunds = getUnutilizedFundsList(wb);
  const docsInsurance = getDocumentsInsuranceStatus(wb);
  const processedCounts = getPaymentProcessedCount(wb);
  const counterpartSplit = getCounterpartSplit(pledgeSheet);
  const processingSpeed = getProcessingSpeed(wb);

  // Sheet-found-but-unreadable checks. Each of these sheets was located by
  // name, but its expected header row / layout didn't match — usually a
  // revised logsheet template. Without these the dashboards would just show
  // blanks with no explanation of why.
  if (targetSheet && targets.size === 0)
    warnings.push(
      'The "Distribution of Target" sheet was found but no province target rows could be read (its layout may have changed) — targets will show as TBD.',
    );
  if (placementSheet && placedActuals.size === 0)
    warnings.push(
      "The Placement sheet was found but no province rows could be read (its layout may have changed) — placed figures will be blank.",
    );
  if (pledgeSheet && pledgedActuals.size === 0)
    warnings.push(
      "The Pledge sheet was found but no province rows could be read (its layout may have changed) — pledged figures will be blank.",
    );
  if (supplementalSheet && supplementalActuals.size === 0)
    warnings.push(
      "The Supplemental Pledge sheet was found but no province rows could be read (its layout may have changed) — supplemental figures will be blank.",
    );
  if (dailyRates.size === 0)
    warnings.push(
      'Could not read provincial daily hiring rates from the "SPES Hiring Rate" sheet — "additional fund needed" estimates will be skipped.',
    );
  if (placementSheet && docsInsurance.size === 0)
    warnings.push(
      "Could not read the Complete Documents / GSIS Insurance columns from the Placement sheet — the Documents note will be omitted.",
    );
  if (paymentSheet && processingSpeed.size === 0)
    warnings.push(
      "Could not read Date Received / Date Submitted to ADMIN from the Payment sheet — the processing-time note will be omitted.",
    );

  const provinces = new Set<string>([
    ...targets.keys(),
    ...paidActuals.keys(),
    ...placedActuals.keys(),
    ...pledgedActuals.keys(),
    ...supplementalActuals.keys(),
  ]);
  const periods: PeriodEntry[] = [];
  let regionTarget = 0;
  let regionFund = 0;
  let regionPaid = 0;
  let regionPaidFund = 0;
  let regionPlaced = 0;
  let regionPledged = 0;
  let regionSupplemental = 0;

  for (const province of provinces) {
    const t = targets.get(province);
    const targetBenef = t?.target ?? null;
    const targetFund = t?.fund ?? null;
    const paid = paidActuals.get(province) ?? { beneficiaries: 0, fund: 0 };
    const placed = placedActuals.get(province) ?? 0;
    const pledged = pledgedActuals.get(province) ?? 0;
    const supplemental = supplementalActuals.get(province) ?? 0;
    const rate = dailyRates.get(province) ?? null;
    const counterpart = counterpartData.get(province);
    const docs = docsInsurance.get(province);
    const processedCount = processedCounts.get(province) ?? 0;
    const split = counterpartSplit.get(province);
    const speed = processingSpeed.get(province);

    if (targetBenef !== null) regionTarget += targetBenef;
    if (targetFund !== null) regionFund += targetFund;
    regionPaid += paid.beneficiaries;
    regionPaidFund += paid.fund;
    regionPlaced += placed;
    regionPledged += pledged;
    regionSupplemental += supplemental;

    const additionalNeeded =
      targetBenef !== null
        ? Math.max(targetBenef - paid.beneficiaries, 0)
        : null;

    const extraNotes: string[] = [];
    if (placed > 0 && targetBenef !== null && placed > targetBenef * 2) {
      extraNotes.push(
        `Note: Placed count (${placed}) significantly exceeds target (${targetBenef}) — worth verifying against the source file for possible duplicate entries.`,
      );
    }
    if (additionalNeeded !== null && additionalNeeded > 0 && rate !== null) {
      const additionalFundNeeded = additionalNeeded * rate * 20;
      extraNotes.push(
        `Additional fund needed (est., via "${year} SPES Hiring Rate" sheet): ₱${additionalFundNeeded.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${additionalNeeded} × ₱${rate}/day × 20 days)`,
      );
    }
    if (counterpart) {
      extraNotes.push(
        `100% Counterpart (source: "100% Counterpart" sheet): ${counterpart.count} LGU(s), GPAI Processed: ${counterpart.gpaiProcessed}/${counterpart.count}`,
      );
    }
    if (docs && docs.totalChecked > 0) {
      extraNotes.push(
        `Documents/Insurance (source: "${year} SPES Placement" sheet — most rows unchecked): ${docs.docsYes} confirmed complete, ${docs.docsNo} confirmed incomplete, ${docs.gsisYes} GSIS-confirmed (out of ${docs.totalChecked} rows with any status recorded)`,
      );
    }
    if (processedCount > 0) {
      extraNotes.push(
        `Payment Processing (source: "${year} SPES Payment" sheet — most rows unmarked): ${processedCount} row(s) explicitly confirmed processed`,
      );
    }
    if (split && (split.lguCounterpart > 0 || split.doleCounterpart > 0)) {
      extraNotes.push(
        `Cost-share split (source: "${year} SPES Pledge" sheet): DOLE Counterpart ₱${split.doleCounterpart.toLocaleString(undefined, { maximumFractionDigits: 2 })} | LGU/Employer Counterpart ₱${split.lguCounterpart.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      );
    }
    if (speed && speed.count > 0) {
      const avgDays = speed.totalDays / speed.count;
      extraNotes.push(
        `Avg. processing time, Received → Submitted to ADMIN (source: "${year} SPES Payment" sheet): ${avgDays.toFixed(1)} days (n=${speed.count})`,
      );
    }

    periods.push({
      year,
      label: `FY ${year} (uploaded file)`,
      scope: province,
      metrics: [
        {
          key: "pledged",
          label: "No. of Students (Pledge)",
          unit: "count",
          target: targetBenef,
          actual: pledged,
          isPlaceholder: targetBenef === null,
          sourceSheet: year + " SPES Pledge",
        },
        {
          key: "supplemental",
          label: "No. of Students (Supplemental)",
          unit: "count",
          target: null,
          actual: supplemental,
          isPlaceholder: true,
          sourceSheet: year + " SPES Supplemental",
        },
        {
          key: "placed",
          label: "No. of Students (Placement)",
          unit: "count",
          target: targetBenef,
          actual: placed,
          isPlaceholder: targetBenef === null,
          sourceSheet: year + " SPES Placement",
        },
        {
          key: "paid",
          label: "No. of Beneficiaries",
          unit: "count",
          target: targetBenef,
          actual: paid.beneficiaries,
          isPlaceholder: targetBenef === null,
          sourceSheet: year + " SPES Payment",
        },
        {
          key: "fund",
          label: "Total Amount",
          unit: "currency",
          target: targetFund,
          actual: paid.fund,
          isPlaceholder: targetFund === null,
          sourceSheet: year + " SPES Payment",
        },
      ],
      extraNotes,
    });
  }

  periods.push({
    year,
    label: `FY ${year} (uploaded file)`,
    scope: "Region",
    metrics: [
      {
        key: "pledged",
        label: "No. of Students (Pledge)",
        unit: "count",
        target: regionTarget || null,
        actual: regionPledged,
        isPlaceholder: regionTarget === 0,
        sourceSheet: year + " SPES Pledge",
      },
      {
        key: "supplemental",
        label: "No. of Students (Supplemental)",
        unit: "count",
        target: null,
        actual: regionSupplemental,
        isPlaceholder: true,
        sourceSheet: year + " SPES Supplemental",
      },
      {
        key: "placed",
        label: "No. of Students (Placement)",
        unit: "count",
        target: regionTarget || null,
        actual: regionPlaced,
        isPlaceholder: regionTarget === 0,
        sourceSheet: year + " SPES Placement",
      },
      {
        key: "paid",
        label: "No. of Beneficiaries",
        unit: "count",
        target: regionTarget || null,
        actual: regionPaid,
        isPlaceholder: regionTarget === 0,
        sourceSheet: year + " SPES Payment",
      },
      {
        key: "fund",
        label: "Total Amount",
        unit: "currency",
        target: regionFund || null,
        actual: regionPaidFund,
        isPlaceholder: regionFund === 0,
        sourceSheet: year + " SPES Payment",
      },
    ],
    note: "Region total, computed from uploaded file.",
  });

  const quarterly = deriveQuarterlyActuals(wb);
  if (Object.keys(quarterly).length === 0)
    warnings.push(
      "Could not derive quarterly breakdown — no valid dates found in Payment sheet.",
    );
  if (unutilizedFunds.length === 0)
    warnings.push(
      '"Takers of Unutilized SPES Funds" sheet had no parseable LGU-level entries — shown only if present.',
    );

  const lguRates: Record<string, LguRateEntry[]> = {};
  for (const [province, entries] of lguRatesMap) {
    lguRates[province] = entries;
  }

  return { periods, warnings, quarterly, unutilizedFunds, lguRates };
}
