import * as XLSX from "xlsx";
import type { PeriodEntry } from "../monitoring/data/mockMonitoring";

export function exportPeriodToExcel(
  programName: string,
  periodLabel: string,
  entries: PeriodEntry[],
): void {
  const wb = XLSX.utils.book_new();

  const rows: (string | number)[][] = [];
  rows.push([`${programName} — ${periodLabel}`]);
  rows.push([]);
  rows.push([
    "Scope",
    "Metric",
    "Source Sheet",
    "Actual",
    "Target",
    "Balance to Target",
  ]);

  entries.forEach((entry) => {
    entry.metrics.forEach((m) => {
      const balance = m.target !== null ? Math.max(m.target - m.actual, 0) : "";
      rows.push([
        entry.scope,
        m.label,
        m.sourceSheet ?? "",
        m.actual,
        m.target ?? "TBD",
        balance,
      ]);
    });
    if (entry.note) {
      rows.push([entry.scope, "Note", "", entry.note]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 20 },
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Summary");

  const fileName = `${programName.replace(/\s+/g, "_")}_${periodLabel.replace(/[^\w]+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
