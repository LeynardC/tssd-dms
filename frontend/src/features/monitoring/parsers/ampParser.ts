import * as XLSX from "xlsx";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { SpesParseResult } from "./spesParser";
import type {
  GenericBreakdowns,
  PeriodicBucket,
  SubScopeRow,
  ReconciliationFinding,
} from "./shared";

// AMP monitoring tracks project PROPOSALS (approval pipeline + cost), not a
// payroll ledger like GIP/SPES — and the source workbook changed shape
// between fiscal years:
//   • FY2025 file: a NATIONWIDE workbook, one sheet per DOLE region (CAR,
//     NCR, RO 1-12, CARAGA...) plus a computed "Summary" sheet. MIMAROPA's
//     own data is only the "RO 4B" sheet, which has no province column, so
//     FY2025 reads as one combined "MIMAROPA (RO 4B)" scope.
//   • FY2026 file: MIMAROPA's OWN workbook — an "AMP Monitoring Sheet" (the
//     proposal list, now with an Address field) plus a "Summary" sheet the
//     RO computes itself (Allocation / On-going / Balance per province).
//     This parser trusts the RO's own Summary totals for the numbers and
//     only uses "AMP Monitoring Sheet" for the per-proposal drill-down list
//     and to work out which province each proposal belongs to.
// Three more FY2026 sheets ("Status of Proposals", "Documents Monitoring",
// "Liquidation Status") track the approval/document/post-project workflow
// in detail; they aren't reflected on the dashboard yet (see methodNotes).

type Row = any[];

function sheetToRows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Row[];
}

function lc(v: any): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
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

function cellRef(col: number, rowIndex: number): string {
  return `${XLSX.utils.encode_col(col)}${rowIndex + 1}`;
}

// Resolve a column by header text rather than a fixed index, so a logsheet
// that inserts/drops a column shifts nothing downstream. -1 when nothing
// matches (caller treats that as "layout changed" and bails or falls back).
function colByHeader(header: Row, ...needles: string[]): number {
  return header.findIndex((h) => {
    const v = lc(h);
    return v !== "" && needles.every((n) => v.includes(n));
  });
}

// Same, but the LAST match — the AMP header rows reuse "Approved" for two
// different columns (a cost column, then a proposal-count column).
function lastColByHeader(header: Row, ...needles: string[]): number {
  let idx = -1;
  header.forEach((h, i) => {
    const v = lc(h);
    if (v !== "" && needles.every((n) => v.includes(n))) idx = i;
  });
  return idx;
}

function findHeaderRow(rows: Row[], ...mustIncludeAll: string[]): number {
  return rows.findIndex((r) =>
    mustIncludeAll.every((needle) =>
      r.some((c) => typeof c === "string" && c.toLowerCase().includes(needle)),
    ),
  );
}

// Sheet names carry no year (unlike GIP), so scan the first few rows of the
// sheets that do carry a title/heading for a 4-digit year instead.
function detectYear(wb: XLSX.WorkBook): number {
  const candidateNames = ["summary", "amp monitoring sheet", "ro 4b"];
  for (const wanted of candidateNames) {
    const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === wanted);
    if (!name) continue;
    const rows = sheetToRows(wb.Sheets[name]);
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      for (const cell of rows[i]) {
        if (typeof cell !== "string") continue;
        const m = cell.match(/\b(20\d{2})\b/);
        if (m) return parseInt(m[1], 10);
      }
    }
  }
  return new Date().getFullYear();
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const PROVINCES = [
  "Oriental Mindoro",
  "Occidental Mindoro",
  "Marinduque",
  "Romblon",
  "Palawan",
] as const;
const REGION_TOTAL = "Region";
const COMBINED_SCOPE = "MIMAROPA (RO 4B)"; // FY2025 shape has no per-province split

// Address text -> province. Province names first (most reliable), then a
// short list of UNAMBIGUOUS municipality/city names for the common case
// where a proponent's address names the town but not the province (e.g.
// "Puerto Princesa City" carries no "Palawan" anywhere in the string).
// Town names that exist in more than one MIMAROPA province (Santa Cruz,
// San Jose, Magsaysay, Looc, Rizal, Roxas) are deliberately left out —
// those addresses fall to "unmatched" and get flagged for a reviewer
// instead of being guessed wrong.
const PROVINCE_NAME_RE: [RegExp, string][] = [
  [/occidental\s+mindoro|occ\.?\s*mindoro/i, "Occidental Mindoro"],
  [/oriental\s+mindoro|or\.?\s*mindoro/i, "Oriental Mindoro"],
  [/marinduque/i, "Marinduque"],
  [/romblon/i, "Romblon"],
  [/palawan/i, "Palawan"],
];
const MUNICIPALITY_RE: [RegExp, string][] = [
  [/\b(abra de ilog|calintaan|lubang|mamburao|paluan|sablayan)\b/i, "Occidental Mindoro"],
  [/\b(baco|bansud|bongabong|bulalacao|calapan|gloria|mansalay|naujan|pinamalayan|pola|puerto galera|socorro|victoria|san teodoro)\b/i, "Oriental Mindoro"],
  [/\b(boac|buenavista|gasan|mogpog|torrijos)\b/i, "Marinduque"],
  [/\b(alcantara|banton|cajidiocan|calatrava|concepcion|corcuera|ferrol|magdiwang|odiongan|san agustin|san andres|san fernando|santa fe)\b/i, "Romblon"],
  [/\b(puerto princesa|aborlan|agutaya|araceli|balabac|bataraza|brooke'?s point|busuanga|cagayancillo|coron|cuyo|dumaran|el nido|kalayaan|linapacan|narra|san vicente|sofronio espa[nñ]ola|taytay)\b/i, "Palawan"],
];

function scopeFromAddress(address: string): string | null {
  if (!address) return null;
  for (const [re, prov] of PROVINCE_NAME_RE) if (re.test(address)) return prov;
  for (const [re, prov] of MUNICIPALITY_RE) if (re.test(address)) return prov;
  return null;
}

function isApproved(status: string): boolean {
  return /\bapproved\b/i.test(status) && !/for approval/i.test(status);
}

interface Proposal {
  controlNo: string;
  proponent: string;
  industry: string;
  status: string;
  proposedCost: number;
  approvedCost: number;
  scope: string | null; // derived province, only ever set when the sheet has an Address column
  address: string;
  dateSubmitted: Date | null;
  remarks: string;
  row: number; // 1-based sheet row, for citing the cell
}

interface ProposalRead {
  proposals: Proposal[];
  addressCol: number;
}

// Reads the proposal list from either "RO 4B" (FY2025) or "AMP Monitoring
// Sheet" (FY2026) — both share the same core columns (Control No., Name of
// Proponent, Industry, Status of Proposal, the two AMP-fund cost columns,
// Date of Submission, Remarks); FY2026 additionally has an Address column.
function readProposals(
  ws: XLSX.WorkSheet,
  sheetName: string,
  warnings: string[],
): ProposalRead {
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "control no", "status of proposal");
  if (headerIdx === -1) {
    warnings.push(
      `Could not find the proposal header row (Control No. / Status of Proposal) in the "${sheetName}" sheet — no proposals could be read from it.`,
    );
    return { proposals: [], addressCol: -1 };
  }
  const header = rows[headerIdx];
  const controlCol = colByHeader(header, "control no");
  const nameCol = colByHeader(header, "name of proponent");
  const industryCol = colByHeader(header, "industry");
  const statusCol = colByHeader(header, "status of proposal");
  const proposedCol = colByHeader(header, "proposed project cost", "under amp");
  const approvedCol = colByHeader(header, "approved project cost", "under amp");
  const dateCol = colByHeader(header, "date of submission");
  const remarksCol = colByHeader(header, "remarks");
  const addressCol = colByHeader(header, "address");

  if (controlCol === -1 || (proposedCol === -1 && approvedCol === -1)) {
    warnings.push(
      `The "${sheetName}" sheet was found but its Control No. / cost columns could not be located (layout may have changed) — no proposals could be read from it.`,
    );
    return { proposals: [], addressCol };
  }

  const out: Proposal[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawControl = row[controlCol];
    if (typeof rawControl !== "string" || !/^AMP-/i.test(rawControl.trim()))
      continue;
    const status =
      statusCol >= 0 && typeof row[statusCol] === "string" ? row[statusCol].trim() : "";
    const proposedCost = proposedCol >= 0 ? num(row[proposedCol]) : 0;
    const approvedCost = approvedCol >= 0 ? num(row[approvedCol]) : 0;
    const proponent =
      nameCol >= 0 && typeof row[nameCol] === "string" ? row[nameCol].trim() : "";
    // A control number placeholder with nothing encoded yet (the FY2026
    // sheet pre-fills a run of "AMP-RO4B-2026-7", "…-8" ahead of actual
    // submissions) isn't a real proposal — skip it.
    if (!proponent && !status && proposedCost === 0 && approvedCost === 0) continue;

    const address =
      addressCol >= 0 && typeof row[addressCol] === "string" ? row[addressCol] : "";
    out.push({
      controlNo: rawControl.trim(),
      proponent,
      industry:
        industryCol >= 0 && typeof row[industryCol] === "string"
          ? row[industryCol].trim()
          : "",
      status,
      proposedCost,
      approvedCost,
      scope: addressCol >= 0 ? scopeFromAddress(address) : null,
      address,
      dateSubmitted: dateCol >= 0 ? asDate(row[dateCol]) : null,
      remarks:
        remarksCol >= 0 && typeof row[remarksCol] === "string"
          ? row[remarksCol].trim()
          : "",
      row: i + 1,
    });
  }
  return { proposals: out, addressCol };
}

function buildSubScope(proposals: Proposal[]): SubScopeRow[] {
  return proposals
    .slice()
    .sort((a, b) => a.controlNo.localeCompare(b.controlNo))
    .map((p) => ({
      name: p.proponent || p.controlNo,
      note:
        [p.controlNo, p.status || "status not yet encoded", p.industry]
          .filter(Boolean)
          .join(" · ") || undefined,
      values: [
        { label: "Proposed Cost", value: p.proposedCost > 0 ? p.proposedCost : null, unit: "currency" },
        { label: "Approved Cost", value: p.approvedCost > 0 ? p.approvedCost : null, unit: "currency" },
      ],
    }));
}

function buildMonthly(proposals: Proposal[]): PeriodicBucket[] {
  const m = new Map<string, PeriodicBucket>();
  for (const p of proposals) {
    const d = p.dateSubmitted;
    const key = d
      ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      : "9999-99";
    const label = d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "Undated";
    const b = m.get(key) ?? { bucket: key, label, primary: 0, secondary: 0 };
    b.primary += 1;
    b.secondary += p.proposedCost;
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

// --- FY2026 "Summary" sheet: the RO's own per-province rollup -------------
// Columns are positional relative to "Allocation" / "On-going" (verified
// against the FY2026 template): Allocation, Approved(cost), On-going,
// Balance, Overall Total(count), For Revision, For Review, For Ocular,
// For Approval, Approved(count). A province row usually fills only ONE of
// "Approved(cost)" / "On-going" — the other is blank — so actual cost =
// the sum of both.
interface ProvinceSummaryRow {
  allocation: number;
  approvedCost: number;
  onGoing: number;
  overallTotal: number;
  approvedCount: number;
  forRevision: number;
  forReview: number;
  forOcular: number;
  forApproval: number;
}

function readProvinceSummary(
  ws: XLSX.WorkSheet,
  warnings: string[],
): Map<string, ProvinceSummaryRow> {
  const out = new Map<string, ProvinceSummaryRow>();
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "allocation", "going");
  if (headerIdx === -1) {
    warnings.push(
      'The "Summary" sheet was found but its Allocation / On-going header row could not be located — per-province figures will show as TBD.',
    );
    return out;
  }
  const header = rows[headerIdx];
  const allocationCol = colByHeader(header, "allocation");
  const approvedCostCol = colByHeader(header, "approved");
  const onGoingCol = colByHeader(header, "going");
  const overallTotalCol = colByHeader(header, "overall total");
  const approvedCountCol = lastColByHeader(header, "approved");
  const forRevisionCol = colByHeader(header, "for revision");
  const forReviewCol = colByHeader(header, "for review");
  const forOcularCol = colByHeader(header, "for ocular");
  const forApprovalCol = colByHeader(header, "for approval");

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const label = typeof row[0] === "string" ? row[0].trim() : "";
    if (!label) continue;
    const isTotal = label.toUpperCase() === "TOTAL";
    const province = PROVINCES.find((p) => p.toLowerCase() === label.toLowerCase());
    if (!isTotal && !province) continue; // trailing notes/blank rows below the table
    out.set(isTotal ? "TOTAL" : province!, {
      allocation: num(row[allocationCol]),
      approvedCost: approvedCostCol >= 0 ? num(row[approvedCostCol]) : 0,
      onGoing: onGoingCol >= 0 ? num(row[onGoingCol]) : 0,
      overallTotal: overallTotalCol >= 0 ? num(row[overallTotalCol]) : 0,
      approvedCount: approvedCountCol >= 0 ? num(row[approvedCountCol]) : 0,
      forRevision: forRevisionCol >= 0 ? num(row[forRevisionCol]) : 0,
      forReview: forReviewCol >= 0 ? num(row[forReviewCol]) : 0,
      forOcular: forOcularCol >= 0 ? num(row[forOcularCol]) : 0,
      forApproval: forApprovalCol >= 0 ? num(row[forApprovalCol]) : 0,
    });
  }
  return out;
}

// --- FY2025 nationwide "Summary" sheet: the RO 4B row ----------------------
// Its header spans three sheet rows (group / CURRENT-CONTINUING / count
// sub-labels), which text-matching can't reliably pick apart, so this reads
// fixed column offsets from the "Total Downloaded Budget" header row —
// verified against the actual FY2025 file's RO 4B row.
interface NationwideRegionRow {
  overallTotal: number;
  forRevision: number;
  forReview: number;
  forOcular: number;
  forApproval: number;
  approvedCount: number;
  beneficiariesCurrent: number;
  beneficiariesContinuing: number;
  establishmentsCurrent: number;
  establishmentsContinuing: number;
  budgetCurrent: number;
  budgetContinuing: number;
}

function readNationwideRegionRow(
  ws: XLSX.WorkSheet,
  regionMatch: RegExp,
): NationwideRegionRow | null {
  const rows = sheetToRows(ws);
  const headerIdx = findHeaderRow(rows, "total downloaded budget");
  if (headerIdx === -1) return null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const label = typeof row[0] === "string" ? row[0] : "";
    if (!regionMatch.test(label)) continue;
    if (typeof row[1] !== "number") return null; // layout guard: col 1 should be the proposal count
    return {
      overallTotal: num(row[1]),
      forRevision: num(row[2]),
      forReview: num(row[3]),
      forOcular: num(row[4]),
      forApproval: num(row[5]),
      approvedCount: num(row[6]),
      beneficiariesCurrent: num(row[7]),
      beneficiariesContinuing: num(row[8]),
      establishmentsCurrent: num(row[9]),
      establishmentsContinuing: num(row[10]),
      budgetCurrent: num(row[11]),
      budgetContinuing: num(row[12]),
    };
  }
  return null;
}

export function parseAmpWorkbook(wb: XLSX.WorkBook): SpesParseResult & GenericBreakdowns {
  const warnings: string[] = [];
  const year = detectYear(wb);
  const methodNotes: string[] = [];
  const reconciliation: ReconciliationFinding[] = [];
  const periods: PeriodEntry[] = [];
  const subScopeBreakdown: Record<string, SubScopeRow[]> = {};
  const periodicBreakdown: Record<string, PeriodicBucket[]> = {};

  const monitoringSheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === "amp monitoring sheet",
  );

  if (monitoringSheetName) {
    // ---- FY2026-style: MIMAROPA's own workbook -----------------------
    const propRead = readProposals(wb.Sheets[monitoringSheetName], monitoringSheetName, warnings);
    const proposals = propRead.proposals;

    const summaryName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "summary");
    if (!summaryName)
      warnings.push(
        'No "Summary" sheet found — per-province Allocation/On-going/Balance figures will show as TBD.',
      );
    const provinceRows = summaryName
      ? readProvinceSummary(wb.Sheets[summaryName], warnings)
      : new Map<string, ProvinceSummaryRow>();

    const proposalsByScope = new Map<string, Proposal[]>();
    const unmatched: Proposal[] = [];
    for (const p of proposals) {
      if (p.scope) {
        if (!proposalsByScope.has(p.scope)) proposalsByScope.set(p.scope, []);
        proposalsByScope.get(p.scope)!.push(p);
      } else {
        unmatched.push(p);
      }
    }

    for (const province of PROVINCES) {
      const pr = provinceRows.get(province);
      const list = proposalsByScope.get(province) ?? [];
      if (!pr && list.length === 0) continue; // nothing this year for this province

      const allocation = pr?.allocation ?? 0;
      const actual = (pr?.approvedCost ?? 0) + (pr?.onGoing ?? 0);
      const overallTotal = pr?.overallTotal ?? list.length;
      const approvedCount = pr?.approvedCount ?? list.filter((p) => isApproved(p.status)).length;

      const extraNotes: string[] = [];
      if (pr) {
        const pipeline = [
          pr.approvedCount > 0 && `${pr.approvedCount} Approved`,
          pr.forOcular > 0 && `${pr.forOcular} For Ocular Visit`,
          pr.forRevision > 0 && `${pr.forRevision} For Revision`,
          pr.forReview > 0 && `${pr.forReview} For Review`,
          pr.forApproval > 0 && `${pr.forApproval} For Approval`,
        ]
          .filter(Boolean)
          .join(", ");
        if (pipeline)
          extraNotes.push(`Proposal pipeline (source: Summary sheet): ${pipeline}.`);
        if (allocation > 0 && actual > allocation)
          extraNotes.push(
            `Cost recorded (₱${Math.round(actual).toLocaleString()}) exceeds the ₱${Math.round(
              allocation,
            ).toLocaleString()} allocation for this province — balance shows as 0, not negative.`,
          );
      } else {
        extraNotes.push(
          `No "${province}" row found on the Summary sheet — figures below are counted from the proposal list only, not the RO's own rollup.`,
        );
      }

      periods.push({
        year,
        label: `FY ${year}`,
        scope: province,
        metrics: [
          {
            key: "allocation",
            label: "Fund Allocation",
            unit: "currency",
            target: allocation > 0 ? allocation : null,
            actual,
            isPlaceholder: allocation <= 0,
            sourceSheet: "Summary",
          },
          {
            key: "proposals",
            label: "Proposals (Approved of Total)",
            unit: "count",
            target: overallTotal,
            actual: approvedCount,
            isPlaceholder: false,
            sourceSheet: "Summary / AMP Monitoring Sheet",
          },
        ],
        extraNotes: extraNotes.length ? extraNotes : undefined,
      });
      subScopeBreakdown[province] = buildSubScope(list);
      if (list.length) periodicBreakdown[province] = buildMonthly(list);
    }

    // Region-wide total = the Summary sheet's own TOTAL row when present,
    // so it matches the RO's own arithmetic rather than being re-summed.
    const totalRow = provinceRows.get("TOTAL");
    if (totalRow || proposals.length) {
      const allocation = totalRow?.allocation ?? 0;
      const actual = totalRow
        ? totalRow.approvedCost + totalRow.onGoing
        : proposals.reduce((s, p) => s + p.proposedCost, 0);
      const overallTotal = totalRow?.overallTotal ?? proposals.length;
      const approvedCount =
        totalRow?.approvedCount ?? proposals.filter((p) => isApproved(p.status)).length;
      const extraNotes: string[] = [];
      if (unmatched.length)
        extraNotes.push(
          `${unmatched.length} proposal(s) could not be matched to a province from their Address — see the data-quality notes below.`,
        );

      periods.push({
        year,
        label: `FY ${year}`,
        scope: REGION_TOTAL,
        metrics: [
          {
            key: "allocation",
            label: "Fund Allocation",
            unit: "currency",
            target: allocation > 0 ? allocation : null,
            actual,
            isPlaceholder: allocation <= 0,
            sourceSheet: "Summary",
          },
          {
            key: "proposals",
            label: "Proposals (Approved of Total)",
            unit: "count",
            target: overallTotal,
            actual: approvedCount,
            isPlaceholder: false,
            sourceSheet: "Summary / AMP Monitoring Sheet",
          },
        ],
        note: "Region-wide total: the 5 provinces, from the Summary sheet's own TOTAL row.",
        extraNotes: extraNotes.length ? extraNotes : undefined,
      });
      subScopeBreakdown[REGION_TOTAL] = buildSubScope(proposals);
      if (proposals.length) periodicBreakdown[REGION_TOTAL] = buildMonthly(proposals);
    }

    if (unmatched.length) {
      reconciliation.push({
        severity: "warn",
        title: `${unmatched.length} proposal(s) could not be matched to a MIMAROPA province from their Address`,
        sheet: monitoringSheetName,
        column: "Address",
        detail:
          "The dashboard reads each proposal's province from its Address field (a province name, or a well-known MIMAROPA town/city name). These addresses matched neither.",
        fix: 'Add the province name to the Address cell for the rows listed (e.g. "…, Occidental Mindoro").',
        cells: unmatched.slice(0, 40).map((p) => ({
          ref: propRead.addressCol >= 0 ? cellRef(propRead.addressCol, p.row - 1) : undefined,
          rows: String(p.row),
          label: p.controlNo || p.proponent,
          value: p.address || "(blank)",
        })),
      });
    }

    if (periods.length === 0)
      warnings.push(
        'No AMP periods could be built from this file — check that it is the AMP Monitoring workbook (needs an "AMP Monitoring Sheet").',
      );

    methodNotes.push(
      "Per-province Fund Allocation / cost / proposal counts are read directly from the Summary sheet's own rows (Allocation, Approved, On-going, Overall Total, Approved columns) — not recomputed from the proposal list, since that sheet is the RO's own official rollup.",
      'Each proposal\'s province (for the drill-down list only) comes from its Address field — the province name if present, otherwise a short list of known MIMAROPA town/city names (e.g. "Puerto Princesa City" → Palawan). An address that matches neither is flagged below rather than guessed.',
      "A proposal row with a Control No. but no proponent, status, or cost yet (a pre-filled placeholder for a future submission) is not counted.",
      'The "Status of Proposals", "Documents Monitoring" and "Liquidation Status" sheets track the approval workflow, document completeness, and post-project follow-up in detail — they are not reflected on this dashboard yet.',
    );
  } else {
    // ---- FY2025-style: nationwide workbook, MIMAROPA = "RO 4B" sheet only ----
    const regionSheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "ro 4b");
    if (!regionSheetName)
      warnings.push(
        'No "RO 4B" sheet found in this nationwide workbook — MIMAROPA\'s AMP proposals could not be located.',
      );
    const proposals = regionSheetName
      ? readProposals(wb.Sheets[regionSheetName], regionSheetName, warnings).proposals
      : [];

    const summaryName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "summary");
    const region = summaryName ? readNationwideRegionRow(wb.Sheets[summaryName], /^\s*ro\s*4b\s*$/i) : null;
    if (summaryName && !region)
      warnings.push(
        'The "Summary" sheet was found but its RO 4B row (or the region-totals header) could not be located — allocation/beneficiary figures will show as TBD.',
      );

    const overallTotal = region?.overallTotal ?? proposals.length;
    const approvedCount = region?.approvedCount ?? proposals.filter((p) => isApproved(p.status)).length;
    const downloadedBudget = region?.budgetCurrent ?? 0;
    const beneficiaries = region?.beneficiariesCurrent ?? 0;

    const extraNotes: string[] = [];
    if (region) {
      const pipeline = [
        region.approvedCount > 0 && `${region.approvedCount} Approved`,
        region.forOcular > 0 && `${region.forOcular} For Ocular Visit`,
        region.forRevision > 0 && `${region.forRevision} For Revision`,
        region.forReview > 0 && `${region.forReview} For DOLE RO Review`,
        region.forApproval > 0 && `${region.forApproval} For Approval`,
      ]
        .filter(Boolean)
        .join(", ");
      if (pipeline)
        extraNotes.push(`Proposal pipeline (source: nationwide Summary sheet, RO 4B row): ${pipeline}.`);
      if (region.beneficiariesContinuing || region.budgetContinuing)
        extraNotes.push(
          `Continuing-funds carryover (source: same row): ${region.beneficiariesContinuing} additional employee beneficiaries, ₱${Math.round(
            region.budgetContinuing,
          ).toLocaleString()} additional downloaded budget — not included in the figures above (current-year funds only).`,
        );
      if (region.establishmentsCurrent)
        extraNotes.push(
          `${region.establishmentsCurrent} establishment(s) covered (current funds; source: Summary sheet).`,
        );
    } else if (proposals.length) {
      extraNotes.push(
        `No nationwide Summary row for RO 4B — the figures above are counted from the "${regionSheetName}" sheet's own proposal rows instead.`,
      );
    }

    periods.push({
      year,
      label: `FY ${year}`,
      scope: COMBINED_SCOPE,
      metrics: [
        {
          key: "allocation",
          label: "Downloaded Budget",
          unit: "currency",
          target: null,
          actual: downloadedBudget,
          isPlaceholder: true,
          sourceSheet: "Summary",
        },
        {
          key: "beneficiaries",
          label: "Employee Beneficiaries",
          unit: "count",
          target: null,
          actual: beneficiaries,
          isPlaceholder: true,
          sourceSheet: "Summary",
        },
        {
          key: "proposals",
          label: "Proposals (Approved of Total)",
          unit: "count",
          target: overallTotal,
          actual: approvedCount,
          isPlaceholder: false,
          sourceSheet: "Summary / RO 4B",
        },
      ],
      note: "FY2025 file format has no per-province breakdown — MIMAROPA reads as one combined region total.",
      extraNotes: extraNotes.length ? extraNotes : undefined,
    });
    subScopeBreakdown[COMBINED_SCOPE] = buildSubScope(proposals);
    if (proposals.length) periodicBreakdown[COMBINED_SCOPE] = buildMonthly(proposals);

    if (proposals.length === 0 && !region)
      warnings.push(
        "No AMP periods could be built from this file — check that it is the nationwide AMP Monitoring workbook.",
      );

    methodNotes.push(
      'FY2025 came from a NATIONWIDE workbook (one sheet per DOLE region) — only the "RO 4B" sheet (MIMAROPA) and its matching row on the nationwide "Summary" sheet were read; every other region\'s sheet was ignored.',
      "Downloaded Budget and Employee Beneficiaries use the CURRENT FUNDS columns only (this fiscal year's new funding) — CONTINUING FUNDS (prior-year carryover) is noted separately, not added in.",
      "FY2025 has no Address field on its proposal sheet, so proposals cannot be split by province for that year — they show as one combined MIMAROPA total. FY2026 onward can be split by province.",
    );
  }

  if (reconciliation.length === 0)
    reconciliation.push({
      severity: "info",
      title: "No data-quality issues found",
      detail: "Every proposal read cleanly and (for FY2026+) matched a province.",
    });

  const sevOrder = { error: 0, warn: 1, info: 2 } as const;
  reconciliation.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return {
    periods,
    warnings,
    quarterly: {},
    unutilizedFunds: [],
    lguRates: {},
    periodicBreakdown,
    subScopeBreakdown,
    breakdownLabels: {
      periodic: "Proposals by submission month",
      periodicCoarse: "Monthly",
      subScope: "Proposal breakdown",
      periodicPrimary: "Proposals submitted",
      periodicSecondary: "Proposed cost",
      subScopeCaption:
        "Proposed and Approved Cost for each proposal, from the AMP Monitoring Sheet. A blank Approved Cost means the proposal hasn't been approved yet — not a data error.",
      periodicSourceLabel: "each proposal's Date of Submission",
      periodicRowNoun: "proposals submitted",
      periodicMatrixCaption:
        'Each proposal is placed in the month of its Date of Submission (AMP Monitoring Sheet); proposals with no date are grouped as "Undated". The Total column is the region-wide sum, and column / row totals reconcile to each province\'s dashboard figure.',
    },
    methodNotes,
    reconciliation,
  };
}
