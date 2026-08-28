import { ref, watch, type Ref } from "vue";
import { getAllProgramFiles, type FileRecord } from "../data/fileStore";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { QuarterlyActual } from "../parsers";

export interface ParsedFileData {
  periods: PeriodEntry[];
  warnings: string[];
  quarterly?: Record<string, QuarterlyActual[]>;
  unutilizedFunds?: {
    lgu: string;
    startingBalance: number | null;
    remainingBalance: number | null;
  }[];
  lguRates?: Record<string, { lgu: string; rate: number }[]>;
}

// A monitoring file, with its parsed_data cast into a known shape.
// Files with no parsed_data (plain uploads, non-SPES files) are excluded
// by getMonitoringFiles() below — dashboards only care about files that
// actually carry monitoring data.
export interface MonitoringFile {
  id: number;
  fileName: string;
  uploadedAt: string;
  uploadedByName: string;
  data: ParsedFileData;
}

export interface PeriodWithSource {
  period: PeriodEntry;
  file: MonitoringFile;
}

function toMonitoringFile(record: FileRecord): MonitoringFile | null {
  if (!record.parsed_data) return null;
  const data = record.parsed_data as unknown as ParsedFileData;
  if (!Array.isArray(data.periods)) return null;

  return {
    id: record.id,
    fileName: record.original_name,
    uploadedAt: record.created_at,
    uploadedByName: record.uploader?.name ?? "Unknown",
    data,
  };
}

function buildPeriodsWithSource(files: MonitoringFile[]): PeriodWithSource[] {
  // Same "latest file wins per period+scope" merge as the old
  // localStorage getPeriodsWithSource() — just fed by real API data now.
  const sorted = [...files].sort((a, b) =>
    a.uploadedAt.localeCompare(b.uploadedAt),
  );
  const byKey = new Map<string, PeriodWithSource>();

  for (const file of sorted) {
    for (const period of file.data.periods) {
      const periodId = period.quarter
        ? `${period.year}-${period.quarter}`
        : `${period.year}`;
      const key = `${periodId}::${period.scope}`;
      byKey.set(key, { period, file });
    }
  }
  return [...byKey.values()];
}

export interface ShadowedPeriod {
  scope: string;
  label: string;
  fileId: number;
  fileName: string;
  uploadedBy: string;
}

// Existing periods whose year/quarter/scope match an incoming upload's
// parsed data — these are periods that upload's data would silently
// overwrite on the dashboards. Shared by both upload entry points (File
// Explorer's drag-and-drop and the dedicated Upload page) so the "safe to
// auto-replace" rule can never drift between them.
export function findShadowedPeriods(
  periods: PeriodWithSource[],
  incoming: { year: number; quarter?: string; scope: string; label: string }[],
): ShadowedPeriod[] {
  const conflicts: ShadowedPeriod[] = [];
  for (const entry of incoming) {
    const match = periods.find(
      ({ period }) =>
        period.year === entry.year &&
        period.quarter === entry.quarter &&
        period.scope === entry.scope,
    );
    if (match) {
      conflicts.push({
        scope: entry.scope,
        label: entry.label,
        fileId: match.file.id,
        fileName: match.file.fileName,
        uploadedBy: match.file.uploadedByName,
      });
    }
  }
  return conflicts;
}

// If every shadowed period traces back to the same existing file, that
// file is unambiguously "the older version of this data" — safe to replace
// outright. If different periods shadow different files (e.g. this upload
// bundles data that used to live in two separate older files), there's no
// single correct target to replace, so this returns null and callers fall
// back to the normal warn-then-upload-as-new-file path.
export function singleShadowedFileId(conflicts: ShadowedPeriod[]): number | null {
  if (conflicts.length === 0) return null;
  const ids = new Set(conflicts.map((c) => c.fileId));
  return ids.size === 1 ? conflicts[0].fileId : null;
}

export function useProgramFiles(programId: Ref<string> | string) {
  const allFiles = ref<FileRecord[]>([]);
  const files = ref<MonitoringFile[]>([]);
  const periods = ref<PeriodWithSource[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    const id = typeof programId === "string" ? programId : programId.value;
    loading.value = true;
    error.value = null;
    try {
      const all = await getAllProgramFiles(id);
      allFiles.value = all;
      const monitoring = all
        .map(toMonitoringFile)
        .filter((f): f is MonitoringFile => f !== null);
      files.value = monitoring;
      periods.value = buildPeriodsWithSource(monitoring);
    } catch (e) {
      error.value =
        "Could not load monitoring data. Check your connection and try again.";
    } finally {
      loading.value = false;
    }
  }

  if (typeof programId !== "string") {
    watch(programId, refresh);
  }

  refresh();

  return { allFiles, files, periods, loading, error, refresh };
}
