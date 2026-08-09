<script setup lang="ts">
import { ref, computed } from "vue";
import {
  getAllCategories,
  addCategory,
  renameCategory,
  toggleCategoryStatus,
  type CategoryRecord,
} from "../data/categoryStore";
import { currentRole } from "../../monitoring/role";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";

const { showToast } = useToast();
const { promptAction } = usePrompt();

const { confirmAction } = useConfirm();
const refreshKey = ref(0);
const categories = computed(() => {
  refreshKey.value; // dependency for reactivity after mutations
  return getAllCategories().sort(
    (a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name),
  );
});

const showAddForm = ref(false);
const newName = ref("");
const newUnit = ref<CategoryRecord["unit"]>("Unit 001");

function handleAdd() {
  if (!newName.value.trim()) return;
  addCategory(newName.value, newUnit.value);
  showToast(`Category "${newName.value}" added`, "success");
  newName.value = "";
  showAddForm.value = false;
  refreshKey.value++;
}

async function handleRename(cat: CategoryRecord) {
  const updated = await promptAction({
    title: "Rename Category",
    message: `Current name: "${cat.name}"`,
    defaultValue: cat.name,
    placeholder: "New category name",
  });
  if (updated) {
    renameCategory(cat.id, updated);
    refreshKey.value++;
    showToast(`Category renamed to "${updated}"`, "success");
  }
}

async function handleToggle(cat: CategoryRecord) {
  const action = cat.status === "Active" ? "retire" : "reactivate";
  const ok = await confirmAction({
    title: action === "retire" ? "Retire Category" : "Reactivate Category",
    message: `Are you sure you want to ${action} "${cat.name}"?`,
    confirmLabel: action === "retire" ? "Retire" : "Reactivate",
    danger: action === "retire",
  });
  if (!ok) return;
  toggleCategoryStatus(cat.id);
  refreshKey.value++;
  showToast(
    `"${cat.name}" ${action === "retire" ? "retired" : "reactivated"}`,
    "success",
  );
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
        <div class="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium mb-1">Category Name</label>
            <input
              v-model="newName"
              type="text"
              placeholder="e.g. New Program Name"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Unit</label>
            <select
              v-model="newUnit"
              class="w-full border border-black/20 rounded p-2 text-sm"
            >
              <option value="Unit 001">Unit 001</option>
              <option value="Unit 002">Unit 002</option>
              <option value="Unit 003">Unit 003</option>
            </select>
          </div>
        </div>
        <button
          @click="handleAdd"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          Save Category
        </button>
      </div>

      <div class="bg-white border border-black/10 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-black/50 bg-black/5 border-b border-black/10"
            >
              <th class="p-3">Name</th>
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
              :class="cat.status === 'Retired' ? 'opacity-50' : ''"
            >
              <td class="p-3 font-medium">{{ cat.name }}</td>
              <td class="p-3 text-black/60">{{ cat.unit }}</td>
              <td class="p-3">
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="
                    cat.status === 'Active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-black/10 text-black/50'
                  "
                >
                  {{ cat.status }}
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
                  {{ cat.status === "Active" ? "Retire" : "Reactivate" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-black/40 italic mt-4">
        Prototype note: category data is stored locally for this demo.
        Categories are never hard-deleted — retiring preserves history for any
        documents that already reference them.
      </p>
    </main>
  </div>
</template>
