import { ref, computed } from "vue";
import { getAllUnits, type UnitRecord } from "./unitStore";

const units = ref<UnitRecord[]>([]);
const loaded = ref(false);
const loading = ref(false);
const loadError = ref("");

// Prevents duplicate simultaneous fetches if multiple components mount
// around the same time (e.g. AppLayout + a page component both calling
// ensureUnitsLoaded() on the same navigation) — same pattern as
// programCache.ts's ensureProgramsLoaded().
let inFlight: Promise<void> | null = null;

async function fetchUnits(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    units.value = await getAllUnits();
    loaded.value = true;
  } catch {
    loadError.value = "Could not load units.";
  } finally {
    loading.value = false;
  }
}

export async function ensureUnitsLoaded(): Promise<void> {
  if (loaded.value) return;
  if (!inFlight) {
    inFlight = fetchUnits().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export async function refreshUnits(): Promise<void> {
  loaded.value = false;
  await ensureUnitsLoaded();
}

export const allUnits = computed(() => units.value);
export const unitsLoading = computed(() => loading.value);
export const unitsError = computed(() => loadError.value);

export const activeUnits = computed(() => units.value.filter((u) => !u.retired));

// code -> display name, for any consumer that just wants a label (e.g. a
// program's UNIT_LABELS[program.unit] lookup) without pulling in the whole
// record. Falls back to the raw code if the unit isn't loaded yet or was
// retired/removed, so a stale reference never renders blank.
export const unitLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  for (const u of units.value) labels[u.code] = u.name;
  return labels;
});
