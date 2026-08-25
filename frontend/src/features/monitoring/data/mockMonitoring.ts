// Shared shape: every program compares a Target vs an Actual, zero-floored balance,
// per Chief's request. Where a real target doesn't exist yet, target is null
// and isPlaceholder is true — the UI must show this honestly, never invent a number.

export interface Metric {
  key: string;
  label: string;
  unit: "count" | "currency" | "days";
  target: number | null;
  actual: number;
  isPlaceholder?: boolean;
  sourceSheet?: string; // which Excel sheet this metric came from
}

export interface PeriodEntry {
  year: number;
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  label: string; // e.g. "FY 2025" or "Q3 2026"
  scope: string; // province name, or "Region" for region-wide totals
  metrics: Metric[];
  note?: string; // e.g. data-quality or partial-period caveats
  extraNotes?: string[];
}

export interface ProgramInfo {
  id: string;
  name: string;
  fullName: string;
  description: string;
  granularity: "quarterly" | "annual";
  periods: PeriodEntry[];
}

function balance(target: number | null, actual: number): number | null {
  if (target === null) return null;
  return Math.max(target - actual, 0);
}

function metric(
  key: string,
  label: string,
  unit: Metric["unit"],
  target: number | null,
  actual: number,
  isPlaceholder = false,
): Metric {
  return { key, label, unit, target, actual, isPlaceholder };
}

export { balance };

export const programs: ProgramInfo[] = [
  {
    id: "spes",
    name: "SPES",
    fullName: "Special Program for Employment of Students",
    description:
      "Target vs. placement vs. paid, by province. Real figures from the 2026 audit logsheet.",
    granularity: "annual",
    periods: [
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Oriental Mindoro",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 416, 496),
          metric("fund", "Fund", "currency", 3073801.79, 2383137.46),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Occidental Mindoro",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 331, 193),
          metric("fund", "Fund", "currency", 2448190.72, 1095047.78),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Marinduque",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 178, 201),
          metric("fund", "Fund", "currency", 1317343.62, 948930.08),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Romblon",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 322, 598),
          metric("fund", "Fund", "currency", 2380373.81, 2662488.2),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Palawan",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 254, 274),
          metric("fund", "Fund", "currency", 1874290.06, 1374788.98),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (as of audit file)",
        scope: "Region",
        metrics: [
          metric("beneficiaries", "Beneficiaries", "count", 1501, 1762),
          metric("fund", "Fund", "currency", 11094000, 8464392.5),
        ],
        note: 'Region total. Source file merges "Oriental Mindoro"/"Or. Mindoro" as one province.',
      },
    ],
  },
  {
    id: "gip",
    name: "GIP",
    fullName: "Government Internship Program",
    description:
      "Stipend/fund monitoring. Real actuals from FY2025 logsheet — targets pending Chief.",
    granularity: "annual",
    periods: [
      {
        year: 2025,
        label: "FY 2025",
        scope: "Oriental Mindoro",
        metrics: [
          metric("interns", "Interns Hired", "count", null, 226, true),
          metric(
            "allocation",
            "Fund Allocation",
            "currency",
            null,
            9084312.28,
            true,
          ),
        ],
      },
      {
        year: 2025,
        label: "FY 2025",
        scope: "Occidental Mindoro",
        metrics: [
          metric("interns", "Interns Hired", "count", null, 249, true),
          metric(
            "allocation",
            "Fund Allocation",
            "currency",
            null,
            13794219.7,
            true,
          ),
        ],
      },
      {
        year: 2025,
        label: "FY 2025",
        scope: "Marinduque",
        metrics: [
          metric("interns", "Interns Hired", "count", null, 90, true),
          metric(
            "allocation",
            "Fund Allocation",
            "currency",
            null,
            4954325.18,
            true,
          ),
        ],
      },
      {
        year: 2025,
        label: "FY 2025",
        scope: "Romblon",
        metrics: [
          metric("interns", "Interns Hired", "count", null, 75, true),
          metric(
            "allocation",
            "Fund Allocation",
            "currency",
            null,
            4268853.66,
            true,
          ),
        ],
      },
      {
        year: 2025,
        label: "FY 2025",
        scope: "Palawan",
        metrics: [
          metric("interns", "Interns Hired", "count", null, 182, true),
          metric(
            "allocation",
            "Fund Allocation",
            "currency",
            null,
            8407231.12,
            true,
          ),
        ],
        note: "Target interns/allocation not yet defined by Chief — awaiting real figures.",
      },
    ],
  },
  {
    id: "do174",
    name: "DO 174",
    fullName: "Department Order 174 — Contracting/Subcontracting Registration",
    description:
      "Registration throughput + processing speed. Real counts from 2025–2026 logs — targets pending Chief.",
    granularity: "quarterly",
    periods: [
      {
        year: 2025,
        quarter: "Q1",
        label: "Q1 2025",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            10,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 3.0, true),
        ],
      },
      {
        year: 2025,
        quarter: "Q2",
        label: "Q2 2025",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            10,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 3.0, true),
        ],
      },
      {
        year: 2025,
        quarter: "Q3",
        label: "Q3 2025",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            15,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 2.5, true),
        ],
      },
      {
        year: 2025,
        quarter: "Q4",
        label: "Q4 2025",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            13,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 2.75, true),
        ],
      },
      {
        year: 2026,
        quarter: "Q1",
        label: "Q1 2026",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            15,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 3.33, true),
        ],
      },
      {
        year: 2026,
        quarter: "Q2",
        label: "Q2 2026",
        scope: "MIMAROPA",
        metrics: [
          metric(
            "registrations",
            "Registrations Processed",
            "count",
            null,
            4,
            true,
          ),
          metric("cycleTime", "Avg. Process Cycle", "days", null, 3.0, true),
        ],
        note: "Partial quarter — source file only has April data for Q2 2026.",
      },
    ],
  },
  {
    id: "amp",
    name: "AMP",
    fullName: "AMP — Proposal Monitoring",
    description:
      "Fund + proposal monitoring. Real figures from FY2025/2026 logsheets — beneficiary target pending Chief.",
    granularity: "annual",
    periods: [
      {
        year: 2025,
        label: "FY 2025",
        scope: "MIMAROPA (RO 4B)",
        metrics: [
          metric(
            "beneficiaries",
            "Employee Beneficiaries",
            "count",
            null,
            76,
            true,
          ),
          metric(
            "allocation",
            "Downloaded Budget",
            "currency",
            null,
            3852367.11,
            true,
          ),
        ],
        note: "12 proposals, all approved. 11 establishments.",
      },
      {
        year: 2026,
        label: "FY 2026 (to date)",
        scope: "Occidental Mindoro",
        metrics: [
          metric("allocation", "Fund Allocation", "currency", 721000, 736969),
        ],
        note: "On-going exceeds allocation — balance shows 0 (zero-floored), not negative.",
      },
      {
        year: 2026,
        label: "FY 2026 (to date)",
        scope: "Oriental Mindoro",
        metrics: [
          metric("allocation", "Fund Allocation", "currency", 721000, 384115),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (to date)",
        scope: "Marinduque",
        metrics: [
          metric("allocation", "Fund Allocation", "currency", 735000, 236490),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (to date)",
        scope: "Romblon",
        metrics: [
          metric("allocation", "Fund Allocation", "currency", 735000, 500000),
        ],
      },
      {
        year: 2026,
        label: "FY 2026 (to date)",
        scope: "Palawan",
        metrics: [
          metric("allocation", "Fund Allocation", "currency", 850000, 205755),
        ],
        note: "2026 file has no beneficiary column (present in 2025) — logsheet template gap, not a system limitation.",
      },
    ],
  },
];

export interface MonitoringSearchResult {
  programId: string;
  programName: string;
  year: number;
  quarter?: string;
  scope: string;
}

// Client-side search across every program's static period data — matches
// on scope (province/region name). Used by the app-wide "search everywhere"
// panel; no backend call needed since this data is already fully loaded.
export function searchMonitoringScopes(
  query: string,
): MonitoringSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: MonitoringSearchResult[] = [];
  for (const program of programs) {
    for (const period of program.periods) {
      if (period.scope.toLowerCase().includes(q)) {
        results.push({
          programId: program.id,
          programName: program.name,
          year: period.year,
          quarter: period.quarter,
          scope: period.scope,
        });
      }
    }
  }
  return results;
}

export function getProgram(id: string): ProgramInfo | undefined {
  return programs.find((p) => p.id === id);
}
