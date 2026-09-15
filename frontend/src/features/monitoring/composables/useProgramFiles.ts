import { ref, computed, watch, type Ref } from "vue";
import { getAllProgramFiles, type FileRecord } from "../data/fileStore";
import type { PeriodEntry } from "../data/mockMonitoring";
import type { QuarterlyActual, GenericBreakdowns } from "../parsers";

export interface ParsedFileData extends GenericBreakdowns {
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

// ---------------------------------------------------------------------------
// Shared per-program cache.
//
// Program Periods, Period Scopes, Period Dashboard and Export Center all read
// the same "all files for this program" data. Previously each view fetched it
// independently on mount, so walking Periods -> Scopes -> Dashboard fired the
// same (parsed_data-heavy) request 3-4 times. Now every useProgramFiles() for
// the same program id shares one cache entry:
//   - first use  -> one fetch, with a loading skeleton
//   - re-mount within REVALIDATE_AFTER_MS -> instant cached render, no request
//   - re-mount later -> instant cached render + a silent background refresh
//   - concurrent callers -> deduped onto one in-flight request
//   - refresh() after an upload/delete -> forced fresh fetch
// ---------------------------------------------------------------------------

interface CacheEntry {
  allFiles: Ref<FileRecord[]>;
  files: Ref<MonitoringFile[]>;
  periods: Ref<PeriodWithSource[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  loadedAt: number; // epoch ms; 0 = never successfully loaded
  inFlight: Promise<void> | null;
}

const cache = new Map<string, CacheEntry>();
const REVALIDATE_AFTER_MS = 10_000;

function entryFor(id: string): CacheEntry {
  let e = cache.get(id);
  if (!e) {
    e = {
      allFiles: ref<FileRecord[]>([]),
      files: ref<MonitoringFile[]>([]),
      periods: ref<PeriodWithSource[]>([]),
      loading: ref(false),
      error: ref<string | null>(null),
      loadedAt: 0,
      inFlight: null,
    };
    cache.set(id, e);
  }
  return e;
}

function runFetch(id: string, e: CacheEntry, background: boolean): Promise<void> {
  if (!background) {
    e.loading.value = true;
    e.error.value = null;
  }
  return getAllProgramFiles(id)
    .then((all) => {
      e.allFiles.value = all;
      const monitoring = all
        .map(toMonitoringFile)
        .filter((f): f is MonitoringFile => f !== null);
      e.files.value = monitoring;
      e.periods.value = buildPeriodsWithSource(monitoring);
      e.loadedAt = Date.now();
    })
    .catch(() => {
      if (!background) {
        e.error.value =
          "Could not load monitoring data. Check your connection and try again.";
      }
    })
    .finally(() => {
      if (!background) e.loading.value = false;
    });
}

function fetchProgram(
  id: string,
  { background = false, force = false }: { background?: boolean; force?: boolean } = {},
): Promise<void> {
  const e = entryFor(id);
  if (e.inFlight) {
    // A forced refresh (after a mutation) must not hand back data from a
    // request that may have started before the mutation — chain a guaranteed
    // fresh fetch after the current one instead.
    if (force) {
      e.inFlight = e.inFlight.then(() => runFetch(id, e, background));
    }
    return e.inFlight;
  }
  e.inFlight = runFetch(id, e, background).finally(() => {
    e.inFlight = null;
  });
  return e.inFlight;
}

export function useProgramFiles(programId: Ref<string> | string) {
  const idRef: Ref<string> =
    typeof programId === "string" ? ref(programId) : programId;

  const view = () => entryFor(idRef.value);
  const allFiles = computed(() => view().allFiles.value);
  const files = computed(() => view().files.value);
  const periods = computed(() => view().periods.value);
  const loading = computed(() => view().loading.value);
  const error = computed(() => view().error.value);

  // A foreground refresh() is the post-upload / post-delete case — it must
  // return genuinely fresh data, so it forces a fetch. A background refresh
  // (the on-focus revalidate) is happy to piggyback on anything in flight.
  function refresh(opts: { background?: boolean } = {}) {
    return fetchProgram(idRef.value, { ...opts, force: !opts.background });
  }

  watch(
    idRef,
    (id) => {
      const e = entryFor(id);
      if (e.loadedAt === 0) {
        fetchProgram(id);
      } else if (Date.now() - e.loadedAt > REVALIDATE_AFTER_MS) {
        fetchProgram(id, { background: true });
      }
    },
    { immediate: true },
  );

  return { allFiles, files, periods, loading, error, refresh };
}
