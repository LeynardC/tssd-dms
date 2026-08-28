import { ref, computed } from "vue";
import { getAllPrograms, type ProgramRecord } from "./programStore";
import { activeUnits } from "../../units/data/unitCache";

const programs = ref<ProgramRecord[]>([]);
const loaded = ref(false);
const loading = ref(false);
const loadError = ref("");

// Prevents duplicate simultaneous fetches if multiple components mount
// around the same time (e.g. AppLayout + a page component both calling
// ensureProgramsLoaded() on the same navigation).
let inFlight: Promise<void> | null = null;

async function fetchPrograms(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    programs.value = await getAllPrograms();
    loaded.value = true;
  } catch {
    loadError.value = "Could not load programs.";
  } finally {
    loading.value = false;
  }
}

export async function ensureProgramsLoaded(): Promise<void> {
  if (loaded.value) return;
  if (!inFlight) {
    inFlight = fetchPrograms().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

// Called after any create/rename/retire mutation, so every consumer of
// this cache (Documents picker, onboarding dropdowns, Programs page
// itself) reflects the change immediately, without a manual page reload.
export async function refreshPrograms(): Promise<void> {
  loaded.value = false;
  await ensureProgramsLoaded();
}

export const allPrograms = computed(() => programs.value);
export const programsLoading = computed(() => loading.value);
export const programsError = computed(() => loadError.value);

export const activePrograms = computed(() =>
  programs.value.filter((p) => !p.retired),
);

// Grouped by unit code, one entry per currently active unit (so a unit
// with no programs yet still shows an empty group instead of disappearing).
export const programsByUnit = computed(() => {
  const grouped: Record<string, { value: string; label: string }[]> = {};
  for (const unit of activeUnits.value) grouped[unit.code] = [];
  for (const prog of activePrograms.value) {
    if (!grouped[prog.unit]) grouped[prog.unit] = [];
    grouped[prog.unit].push({ value: prog.code, label: prog.name });
  }
  for (const unit of Object.keys(grouped)) {
    grouped[unit].sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
});
