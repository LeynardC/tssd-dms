import { ref, watch, type Ref } from "vue";
import { getAllProgramFiles, type FileRecord } from "../data/fileStore";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { QuarterlyActual } from "../data/uploadStore";

export interface ParsedFileData {
  periods: PeriodEntry[];
  warnings: string[];
  quarterly?: Record<string, QuarterlyActual[]>;
  unutilizedFunds?: {
    lgu: string;
    startingBalance: number | null;
    remainingBalance: number | null;
  }[];
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

export function useProgramFiles(programId: Ref<string> | string) {
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

  return { files, periods, loading, error, refresh };
}
