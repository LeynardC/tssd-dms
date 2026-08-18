import { ref, computed } from "vue";
import { getAllCategories, type CategoryRecord } from "./categoryStore";

export const UNIT_LABELS: Record<CategoryRecord["unit"], string> = {
  unit_001: "Unit 001",
  unit_002: "Unit 002",
  unit_003: "Unit 003",
};

export const UNITS = [
  { value: "unit_001" as const, label: "Unit 001" },
  { value: "unit_002" as const, label: "Unit 002" },
  { value: "unit_003" as const, label: "Unit 003" },
];

const categories = ref<CategoryRecord[]>([]);
const loaded = ref(false);
const loading = ref(false);
const loadError = ref("");

// Prevents duplicate simultaneous fetches if multiple components mount
// around the same time (e.g. AppLayout + a page component both calling
// ensureCategoriesLoaded() on the same navigation).
let inFlight: Promise<void> | null = null;

async function fetchCategories(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    categories.value = await getAllCategories();
    loaded.value = true;
  } catch {
    loadError.value = "Could not load categories.";
  } finally {
    loading.value = false;
  }
}

export async function ensureCategoriesLoaded(): Promise<void> {
  if (loaded.value) return;
  if (!inFlight) {
    inFlight = fetchCategories().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

// Called after any create/rename/retire mutation, so every consumer of
// this cache (Documents picker, onboarding dropdowns, Categories page
// itself) reflects the change immediately, without a manual page reload.
export async function refreshCategories(): Promise<void> {
  loaded.value = false;
  await ensureCategoriesLoaded();
}

export const allCategories = computed(() => categories.value);
export const categoriesLoading = computed(() => loading.value);
export const categoriesError = computed(() => loadError.value);

export const activeCategories = computed(() =>
  categories.value.filter((c) => !c.retired),
);

export const programsByUnit = computed(() => {
  const grouped: Record<string, { value: string; label: string }[]> = {
    unit_001: [],
    unit_002: [],
    unit_003: [],
  };
  for (const cat of activeCategories.value) {
    grouped[cat.unit]?.push({ value: cat.code, label: cat.name });
  }
  for (const unit of Object.keys(grouped)) {
    grouped[unit].sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
});
