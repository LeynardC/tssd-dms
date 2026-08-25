import { ref } from "vue";
import { apiFetch } from "../features/auth/authService";
import {
  searchMonitoringScopes,
  type MonitoringSearchResult,
} from "../features/monitoring/data/mockMonitoring";

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
        monitoring: searchMonitoringScopes(trimmed),
      };
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Search failed. Please try again.";
      results.value = { ...EMPTY_RESULTS };
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    results.value = { ...EMPTY_RESULTS };
    error.value = "";
  }

  return { results, loading, error, search, clear, hasResults };
}
