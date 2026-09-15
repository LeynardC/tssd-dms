import { ref } from "vue";
import { apiFetch } from "../features/auth/authService";
import {
  searchMonitoringScopes,
  getProgram,
  type MonitoringSearchResult,
} from "../features/monitoring/data/mockMonitoring";
import {
  hasParser,
  PARSER_PROGRAM_IDS,
} from "../features/monitoring/parsers/registry";
import {
  peekCachedPeriods,
  warmProgramFiles,
} from "../features/monitoring/composables/useProgramFiles";

export interface FileSearchResult {
  id: number;
  program_id: string;
  folder_id: number | null;
  original_name: string;
}

export interface FolderSearchResult {
  id: number;
  program_id: string;
  name: string;
  parent_id: number | null;
}

export interface StaffSearchResult {
  id: number;
  name: string;
  username: string;
  staff_id: string;
  unit: string | null;
  assigned_program: string | null;
}

export interface GlobalSearchResults {
  files: FileSearchResult[];
  folders: FolderSearchResult[];
  staff: StaffSearchResult[];
  monitoring: MonitoringSearchResult[];
}

const EMPTY_RESULTS: GlobalSearchResults = {
  files: [],
  folders: [],
  staff: [],
  monitoring: [],
};

export function useGlobalSearch() {
  const results = ref<GlobalSearchResults>({ ...EMPTY_RESULTS });
  const loading = ref(false);
  const error = ref("");

  const hasResults = () =>
    results.value.files.length > 0 ||
    results.value.folders.length > 0 ||
    results.value.staff.length > 0 ||
    results.value.monitoring.length > 0;

  async function search(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      results.value = { ...EMPTY_RESULTS };
      return;
    }

    loading.value = true;
    error.value = "";
    try {
      const params = new URLSearchParams({ q: trimmed });
      const backendResults = await apiFetch<{
        files: FileSearchResult[];
        folders: FolderSearchResult[];
        staff: StaffSearchResult[];
      }>(`/api/search?${params.toString()}`);

      results.value = {
        files: backendResults.files,
        folders: backendResults.folders,
        staff: backendResults.staff,
        // Only surface monitoring hits for programs that actually have a
        // parser. The rest of searchMonitoringScopes() comes from
        // mockMonitoring.ts scaffolding and would land the user on an empty
        // dashboard — same rule the Monitoring Hub uses. Programs with no
        // static data at all (GIP) are covered by searchLiveMonitoringScopes
        // instead, reading from each program's real uploaded data.
        monitoring: [
          ...searchMonitoringScopes(trimmed).filter((r) => hasParser(r.programId)),
          ...searchLiveMonitoringScopes(trimmed),
        ],
      };
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Search failed. Please try again.";
      results.value = { ...EMPTY_RESULTS };
    } finally {
      loading.value = false;
    }
  }

  // Programs like GIP ship no static period data (mockMonitoring.ts keeps
  // `periods: []` deliberately — real data lives in each uploaded file's
  // parsed_data). searchMonitoringScopes() above can never see those, so for
  // any parser-backed program with nothing static to search, fall back to
  // whatever's already cached from useProgramFiles (Monitoring Hub, Program
  // Periods, etc. all populate it). No fetch is forced on every keystroke —
  // warmProgramFiles() just makes sure a background fetch is in flight so a
  // later search (or the page itself) has fresh data next time.
  function searchLiveMonitoringScopes(query: string): MonitoringSearchResult[] {
    const q = query.toLowerCase();
    const results: MonitoringSearchResult[] = [];
    for (const id of PARSER_PROGRAM_IDS) {
      const program = getProgram(id);
      if (!program || program.periods.length > 0) continue;

      warmProgramFiles(id);
      for (const { period } of peekCachedPeriods(id)) {
        if (period.scope.toLowerCase().includes(q)) {
          results.push({
            programId: id,
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

  function clear() {
    results.value = { ...EMPTY_RESULTS };
    error.value = "";
  }

  return { results, loading, error, search, clear, hasResults };
}
