<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  addCategory,
  renameCategory,
  toggleCategoryStatus,
  type CategoryRecord,
} from "../data/categoryStore";
import { currentRole } from "../../monitoring/role";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";
import { computed } from "vue";
import {
  ensureCategoriesLoaded,
  refreshCategories,
  allCategories,
  categoriesLoading,
  categoriesError,
  UNIT_LABELS,
} from "../data/categoryCache";

const categoryFilter = ref("");

const categories = computed(() => {
  const sorted = [...allCategories.value].sort(
    (a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name),
  );
  const q = categoryFilter.value.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
});
const loading = categoriesLoading;
const loadError = categoriesError;

onMounted(ensureCategoriesLoaded);

const { showToast } = useToast();
const { promptAction } = usePrompt();
const { confirmAction } = useConfirm();

const showAddForm = ref(false);
const newCode = ref("");
const newName = ref("");
const newUnit = ref<CategoryRecord["unit"]>("unit_001");
const adding = ref(false);

function isDuplicateName(
  name: string,
  unit: CategoryRecord["unit"],
  excludeId?: number,
): boolean {
  const normalized = name.trim().toLowerCase();
  return categories.value.some(
    (c) =>
      c.id !== excludeId &&
      c.unit === unit &&
      c.name.trim().toLowerCase() === normalized,
  );
}

async function handleAdd() {
  const trimmedCode = newCode.value.trim().toLowerCase();
  const trimmedName = newName.value.trim();
  if (!trimmedCode || !trimmedName) return;
  if (isDuplicateName(trimmedName, newUnit.value)) {
    showToast(
      `A category named "${trimmedName}" already exists in ${UNIT_LABELS[newUnit.value]}.`,
      "error",
    );
    return;
  }
  adding.value = true;
  try {
    await addCategory(trimmedCode, trimmedName, newUnit.value);
    showToast(`Category "${trimmedName}" added`, "success");
    newCode.value = "";
    newName.value = "";
    showAddForm.value = false;
    await refreshCategories();
  } catch {
    showToast("Could not add category.", "error");
  } finally {
    adding.value = false;
  }
}

async function handleRename(cat: CategoryRecord) {
  const updated = await promptAction({
    title: "Rename Category",
    message: `Current name: "${cat.name}"`,
    defaultValue: cat.name,
    placeholder: "New category name",
  });
  if (!updated) return;
  const trimmed = updated.trim();
  if (isDuplicateName(trimmed, cat.unit, cat.id)) {
    showToast(
      `A category named "${trimmed}" already exists in ${UNIT_LABELS[cat.unit]}.`,
      "error",
    );
    return;
  }
  try {
    await renameCategory(cat.id, trimmed);
    await refreshCategories();
    showToast(`Category renamed to "${trimmed}"`, "success");
  } catch {
    showToast("Could not rename category.", "error");
  }
}

async function handleToggle(cat: CategoryRecord) {
  const action = cat.retired ? "reactivate" : "retire";
  const ok = await confirmAction({
    title: action === "retire" ? "Retire Category" : "Reactivate Category",
    message: `Are you sure you want to ${action} "${cat.name}"?`,
    confirmLabel: action === "retire" ? "Retire" : "Reactivate",
    danger: action === "retire",
  });
  if (!ok) return;
  try {
    await toggleCategoryStatus(cat.id);
    await refreshCategories();
    showToast(
      `"${cat.name}" ${action === "retire" ? "retired" : "reactivated"}`,
      "success",
    );
  } catch {
    showToast("Could not update category.", "error");
  }
}

const isChief = computed(() => currentRole.value === "chief");
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Categories</h1>
      <p class="text-white/80 text-sm mt-1">
        Manage document categories used across Registration forms and Units.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <button
        v-if="isChief"
        @click="showAddForm = !showAddForm"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition mb-6"
      >
        + Add Category
      </button>

      <div
        v-if="isChief && showAddForm"
        class="bg-white border border-black/10 rounded-lg p-5 mb-6"
      >
        <div class="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label
              for="add-category-code"
              class="block text-sm font-medium mb-1"
              >Code</label
            >
            <input
              id="add-category-code"
              v-model="newCode"
              type="text"
              placeholder="e.g. peso2"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
            <p class="text-xs text-black/60 mt-1">
              Permanent, URL-safe identifier — cannot be changed later.
            </p>
          </div>
          <div>
            <label
              for="add-category-name"
              class="block text-sm font-medium mb-1"
              >Category Name</label
            >
            <input
              id="add-category-name"
              v-model="newName"
              type="text"
              placeholder="e.g. New Program Name"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
          </div>
          <div>
            <label
              for="add-category-unit"
              class="block text-sm font-medium mb-1"
              >Unit</label
            >
            <select
              id="add-category-unit"
              v-model="newUnit"
              class="w-full border border-black/20 rounded p-2 text-sm"
            >
              <option value="unit_001">Unit 001</option>
              <option value="unit_002">Unit 002</option>
              <option value="unit_003">Unit 003</option>
            </select>
          </div>
        </div>
        <button
          @click="handleAdd"
          :disabled="adding"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ adding ? "Saving..." : "Save Category" }}
        </button>
      </div>

      <div
        v-if="loading"
        class="bg-white border border-black/10 rounded-lg overflow-hidden animate-pulse"
      >
        <div class="p-3 bg-black/5 border-b border-black/10">
          <div class="h-3 w-full bg-black/10 rounded"></div>
        </div>
        <div
          v-for="i in 5"
          :key="i"
          class="flex items-center gap-4 p-3 border-b border-black/5 last:border-0"
        >
          <div class="h-4 w-32 bg-black/10 rounded"></div>
          <div class="h-3 w-16 bg-black/10 rounded"></div>
          <div class="h-3 w-20 bg-black/10 rounded"></div>
          <div class="h-5 w-16 bg-black/10 rounded-full ml-auto"></div>
        </div>
      </div>
      <p v-else-if="loadError" class="text-sm text-red-600">
        {{ loadError }}
      </p>

      <div v-else>
        <div class="relative w-56 mb-3">
          <input
            v-model="categoryFilter"
            type="text"
            placeholder="Filter by name or code..."
            class="w-full border border-black/20 rounded px-3 py-1.5 pr-7 text-sm focus:outline-none focus:border-dole-blue"
          />
          <button
            v-if="categoryFilter"
            @click="categoryFilter = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-black/60 hover:text-black/70 text-sm leading-none"
            aria-label="Clear filter"
          >
            ✕
          </button>
        </div>
        <p
          v-if="categories.length === 0 && categoryFilter.trim()"
          class="text-sm text-black/50"
        >
          No categories match "{{ categoryFilter }}".
        </p>
        <div
          v-else
          class="bg-white border border-black/10 rounded-lg overflow-hidden"
        >
          <table class="w-full text-sm">
            <thead>
              <tr
                class="text-left text-black/50 bg-black/5 border-b border-black/10"
              >
                <th class="p-3">Name</th>
                <th class="p-3">Code</th>
                <th class="p-3">Unit</th>
                <th class="p-3">Status</th>
                <th v-if="isChief" class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cat in categories"
                :key="cat.id"
                class="border-b border-black/5 last:border-0"
                :class="cat.retired ? 'opacity-50' : ''"
              >
                <td class="p-3 font-medium">{{ cat.name }}</td>
                <td class="p-3 text-black/60 font-mono text-xs">
                  {{ cat.code }}
                </td>
                <td class="p-3 text-black/60">{{ UNIT_LABELS[cat.unit] }}</td>
                <td class="p-3">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full"
                    :class="
                      !cat.retired
                        ? 'bg-green-100 text-green-700'
                        : 'bg-black/10 text-black/50'
                    "
                  >
                    {{ cat.retired ? "Retired" : "Active" }}
                  </span>
                </td>
                <td v-if="isChief" class="p-3 text-right space-x-3">
                  <button
                    @click="handleRename(cat)"
                    class="text-xs text-dole-blue hover:underline"
                  >
                    Rename
                  </button>
                  <button
                    @click="handleToggle(cat)"
                    class="text-xs text-dole-red hover:underline"
                  >
                    {{ cat.retired ? "Reactivate" : "Retire" }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>
