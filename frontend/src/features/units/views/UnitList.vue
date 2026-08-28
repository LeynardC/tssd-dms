<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  addUnit,
  renameUnit,
  updateUnitDescription,
  toggleUnitStatus,
  type UnitRecord,
} from "../data/unitStore";
import {
  ensureUnitsLoaded,
  refreshUnits,
  allUnits,
  unitsLoading,
  unitsError,
} from "../data/unitCache";
import {
  ensureProgramsLoaded,
  refreshPrograms,
  programsByUnit,
} from "../../programs/data/programCache";
import { currentRole } from "../../monitoring/role";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";

onMounted(ensureUnitsLoaded);
onMounted(ensureProgramsLoaded);

const { showToast } = useToast();
const { promptAction } = usePrompt();
const { confirmAction } = useConfirm();

const isChief = computed(() => currentRole.value === "chief");

const sortedUnits = computed(() =>
  [...allUnits.value].sort((a, b) => a.name.localeCompare(b.name)),
);

const showAddForm = ref(false);
const newCode = ref("");
const newName = ref("");
const adding = ref(false);

function isDuplicateName(name: string, excludeId?: number): boolean {
  const normalized = name.trim().toLowerCase();
  return allUnits.value.some(
    (u) => u.id !== excludeId && u.name.trim().toLowerCase() === normalized,
  );
}

async function handleAdd() {
  const trimmedCode = newCode.value.trim().toLowerCase();
  const trimmedName = newName.value.trim();
  if (!trimmedCode || !trimmedName) return;
  if (isDuplicateName(trimmedName)) {
    showToast(`A unit named "${trimmedName}" already exists.`, "error");
    return;
  }
  adding.value = true;
  try {
    await addUnit(trimmedCode, trimmedName);
    showToast(`Unit "${trimmedName}" added`, "success");
    newCode.value = "";
    newName.value = "";
    showAddForm.value = false;
    await refreshUnits();
    await refreshPrograms();
  } catch {
    showToast("Could not add unit.", "error");
  } finally {
    adding.value = false;
  }
}

async function handleRename(unit: UnitRecord) {
  const updated = await promptAction({
    title: "Rename Unit",
    message: `Current name: "${unit.name}"`,
    defaultValue: unit.name,
    placeholder: "New unit name",
  });
  if (!updated) return;
  const trimmed = updated.trim();
  if (isDuplicateName(trimmed, unit.id)) {
    showToast(`A unit named "${trimmed}" already exists.`, "error");
    return;
  }
  try {
    await renameUnit(unit.id, trimmed);
    await refreshUnits();
    await refreshPrograms();
    showToast(`Unit renamed to "${trimmed}"`, "success");
  } catch {
    showToast("Could not rename unit.", "error");
  }
}

async function handleEditDescription(unit: UnitRecord) {
  const updated = await promptAction({
    title: "Edit Unit Description",
    defaultValue: unit.description ?? "",
    placeholder: "What does this unit do?",
  });
  if (updated === null) return;
  try {
    await updateUnitDescription(unit.id, updated.trim());
    await refreshUnits();
    showToast("Description updated", "success");
  } catch {
    showToast("Could not update description.", "error");
  }
}

async function handleToggle(unit: UnitRecord) {
  const action = unit.retired ? "reactivate" : "retire";
  const ok = await confirmAction({
    title: action === "retire" ? "Retire Unit" : "Reactivate Unit",
    message: `Are you sure you want to ${action} "${unit.name}"?`,
    confirmLabel: action === "retire" ? "Retire" : "Reactivate",
    danger: action === "retire",
  });
  if (!ok) return;
  try {
    await toggleUnitStatus(unit.id);
    await refreshUnits();
    await refreshPrograms();
    showToast(
      `"${unit.name}" ${action === "retire" ? "retired" : "reactivated"}`,
      "success",
    );
  } catch {
    showToast("Could not update unit.", "error");
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Units</h1>
      <p class="text-white/80 text-sm mt-1">
        Units group programs and staff — drill into a unit to see what's under it.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <button
        v-if="isChief"
        @click="showAddForm = !showAddForm"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition mb-6"
      >
        + Add Unit
      </button>

      <div
        v-if="isChief && showAddForm"
        class="bg-white border border-black/10 rounded-lg p-5 mb-6"
      >
        <div class="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label for="add-unit-code" class="block text-sm font-medium mb-1"
              >Code</label
            >
            <input
              id="add-unit-code"
              v-model="newCode"
              type="text"
              placeholder="e.g. unit_004"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
            <p class="text-xs text-black/60 mt-1">
              Permanent, URL-safe identifier — cannot be changed later.
            </p>
          </div>
          <div>
            <label for="add-unit-name" class="block text-sm font-medium mb-1"
              >Unit Name</label
            >
            <input
              id="add-unit-name"
              v-model="newName"
              type="text"
              placeholder="e.g. Employment Facilitation"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
          </div>
        </div>
        <button
          @click="handleAdd"
          :disabled="adding"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ adding ? "Saving..." : "Save Unit" }}
        </button>
      </div>

      <div v-if="unitsLoading" class="animate-pulse space-y-4">
        <div
          v-for="i in 3"
          :key="i"
          class="bg-white border border-black/10 rounded-lg p-5 h-24"
        ></div>
      </div>
      <p v-else-if="unitsError" class="text-sm text-red-600">
        {{ unitsError }}
      </p>

      <div v-else class="space-y-4">
        <div
          v-for="unit in sortedUnits"
          :key="unit.id"
          class="bg-white border border-black/10 rounded-lg p-5"
          :class="unit.retired ? 'opacity-50' : ''"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <p class="font-display text-lg font-semibold text-dole-blue">
                  {{ unit.name }}
                </p>
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="
                    !unit.retired
                      ? 'bg-green-100 text-green-700'
                      : 'bg-black/10 text-black/50'
                  "
                >
                  {{ unit.retired ? "Retired" : "Active" }}
                </span>
              </div>
              <p class="text-xs text-black/50 font-mono mt-0.5">
                {{ unit.code }}
              </p>
              <p
                class="text-sm text-black/60 mt-2"
                :class="!unit.description ? 'italic text-black/40' : ''"
              >
                {{ unit.description || "No description yet." }}
              </p>
            </div>
            <div v-if="isChief" class="flex gap-3 shrink-0">
              <button
                @click="handleEditDescription(unit)"
                class="text-xs text-dole-blue hover:underline"
              >
                Edit description
              </button>
              <button
                @click="handleRename(unit)"
                class="text-xs text-dole-blue hover:underline"
              >
                Rename
              </button>
              <button
                @click="handleToggle(unit)"
                class="text-xs text-dole-red hover:underline"
              >
                {{ unit.retired ? "Reactivate" : "Retire" }}
              </button>
            </div>
          </div>

          <div class="border-t border-black/5 mt-4 pt-4">
            <p class="text-xs font-medium text-black/50 mb-2">
              Programs ({{ (programsByUnit[unit.code] ?? []).length }})
            </p>
            <p
              v-if="!(programsByUnit[unit.code] ?? []).length"
              class="text-sm text-black/40 italic"
            >
              No active programs in this unit yet.
            </p>
            <div v-else class="flex flex-wrap gap-2">
              <router-link
                v-for="prog in programsByUnit[unit.code]"
                :key="prog.value"
                :to="{ name: 'program-profile', params: { programCode: prog.value } }"
                class="text-sm px-3 py-1.5 rounded-full bg-black/5 hover:bg-dole-blue hover:text-white transition"
              >
                {{ prog.label }}
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
