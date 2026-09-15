// Cross-parser types. SPES still carries its own bespoke extras
// (quarterly / lguRates / unutilizedFunds in spesParser.ts) that the
// reports/export subsystem depends on; these generic slots are what every
// parser built after SPES — GIP now, DO 174 and AMP next — fills instead,
// so the dashboard renders one breakdown component for all of them.

export type MetricUnit = "count" | "currency" | "days";

// One time bucket inside a reporting period. Months for GIP's half-month
// stipend cut-offs, quarters for a quarterly program like DO 174.
export interface PeriodicBucket {
  bucket: string; // sortable key, e.g. "2025-03" or "2025-Q1"
  label: string; // display, e.g. "Mar 2025" or "Q1 2025"
  primary: number; // the count-type figure (interns, registrations, beneficiaries)
  secondary: number; // the currency figure (disbursed, fund)
}

// One NTP's (or LGU's) slice of a single time bucket — lets a period row in
// the dashboard expand to show which NTPs made up that month / cut-off.
export interface PeriodicSubRow {
  name: string; // e.g. "ORMIN-03-2025"
  note?: string; // e.g. "ADL 2025-02-0126"
  primary: number; // same meaning as PeriodicBucket.primary, for this NTP
  secondary: number; // same meaning as PeriodicBucket.secondary, for this NTP
}

// One row of a per-scope sub-breakdown table: an NTP for GIP, a
// municipality/LGU for a placement program, etc. `values` is left open so
// each program decides which columns it shows.
export interface SubScopeRow {
  name: string; // e.g. "ORMIN-03-2025"
  note?: string; // e.g. "NGA (Batch 1) · ADL 2025-02-0126"
  // value is null when the figure is unknown/not applicable (renders as "—").
  values: { label: string; value: number | null; unit: MetricUnit }[];
}

// One concrete spot in the workbook a finding points at, so a reviewer can
// jump straight to the cell in Excel. `ref` is an A1-style cell or range
// within `ReconciliationFinding.sheet` (e.g. "Q45" or "B120:B138"); it is
// omitted when the fix is "add a row that isn't there yet".
export interface ReconciliationCell {
  ref?: string; // A1 cell/range within the finding's sheet, e.g. "Q45" or "B37:B43"
  rows?: string; // the row number(s) alone, e.g. "45" or "37–43", when a single column
  label: string; // which NTP / item, e.g. "MIMAROPA-11-2025"
  value?: string; // the current (wrong) cell value, when useful
  amount?: number; // peso figure, rendered as a ₱ chip
}

// A data-quality / cross-sheet reconciliation note surfaced on the
// dashboard so reviewers see exactly where the source file is imperfect —
// and, when it's a column/row mismatch, exactly which cells to fix before
// re-uploading.
export interface ReconciliationFinding {
  severity: "info" | "warn" | "error";
  title: string;
  detail?: string; // short prose context
  sheet?: string; // which worksheet the cells below live in
  column?: string; // the column to look in, e.g. 'Province (column Q)'
  fix?: string; // one-line instruction: what to change in Excel
  cells?: ReconciliationCell[]; // the specific spots to fix
}

// Optional generic extras a parser can attach to its result, keyed by the
// same scope string used in PeriodEntry.scope ("Palawan", "Region", …).
export interface GenericBreakdowns {
  periodicBreakdown?: Record<string, PeriodicBucket[]>;
  // Optional finer split of the same figures (GIP: per half-month cut-off).
  // The dashboard offers it as a toggle next to periodicBreakdown.
  periodicBreakdownFine?: Record<string, PeriodicBucket[]>;
  // NTP-level detail for a time bucket, so a period row can expand. Keyed
  // scope -> bucket key -> rows. `periodicSubRows` matches periodicBreakdown
  // (month keys); `periodicSubRowsFine` matches periodicBreakdownFine (cut-off).
  periodicSubRows?: Record<string, Record<string, PeriodicSubRow[]>>;
  periodicSubRowsFine?: Record<string, Record<string, PeriodicSubRow[]>>;
  subScopeBreakdown?: Record<string, SubScopeRow[]>;
  // Human-readable titles for the tables above, shown as the collapsible
  // headers. Falls back to generic wording when a parser omits them.
  breakdownLabels?: {
    periodic?: string; // collapsible header, e.g. "Month-by-month disbursement"
    periodicCoarse?: string; // toggle label for periodicBreakdown, e.g. "Monthly"
    periodicFine?: string; // toggle label for periodicBreakdownFine, e.g. "By cut-off"
    subScope?: string; // collapsible header, e.g. "NTP breakdown"
    periodicPrimary?: string; // column header for PeriodicBucket.primary
    periodicSecondary?: string; // column header for PeriodicBucket.secondary
    // Italic footnote under the sub-scope table on the period dashboard.
    // Defaults to GIP's original wording when a parser omits it.
    subScopeCaption?: string;
    // What determines which month a periodic bucket falls into, e.g. "each
    // payroll's employment period" (GIP) vs "each proposal's Date of
    // Submission" (AMP) — fills the periodic table's footnote sentence.
    periodicSourceLabel?: string;
    // What a clicked-open period row lists, e.g. "NTPs paid" (GIP) vs
    // "proposals submitted" (AMP) — same footnote sentence.
    periodicRowNoun?: string;
    // Italic footnote under the cross-scope monthly matrix on the period
    // list page (PeriodScopes.vue). Defaults to GIP's original wording.
    periodicMatrixCaption?: string;
  };
  // "How the numbers were built" + where the two source sheets don't line up.
  methodNotes?: string[];
  reconciliation?: ReconciliationFinding[];
}
