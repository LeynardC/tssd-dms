<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  addProgram,
  renameProgram,
  toggleProgramStatus,
  type ProgramRecord,
} from "../data/programStore";
import { currentRole } from "../../monitoring/role";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";
import {
  ensureProgramsLoaded,
  refreshPrograms,
  allPrograms,
  programsLoading,
  programsError,
} from "../data/programCache";
import {
  ensureUnitsLoaded,
  activeUnits,
  unitLabels,
} from "../../units/data/unitCache";

const programFilter = ref("");

const programs = computed(() => {
  const sorted = [...allPrograms.value].sort(
    (a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name),
  );
  const q = programFilter.value.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter(
    (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
  );
});
const loading = programsLoading;
const loadError = programsError;

onMounted(ensureProgramsLoaded);
onMounted(ensureUnitsLoaded);

const { showToast } = useToast();
const { promptAction } = usePrompt();
const { confirmAction } = useConfirm();

const showAddForm = ref(false);
const newCode = ref("");
const newName = ref("");
const newUnit = ref("");
const adding = ref(false);

function isDuplicateName(
  name: string,
  unit: string,
  excludeId?: number,
): boolean {
  const normalized = name.trim().toLowerCase();
  return programs.value.some(
    (p) =>
      p.id !== excludeId &&
      p.unit === unit &&
      p.name.trim().toLowerCase() === normalized,
  );
}

async function handleAdd() {
  const trimmedCode = newCode.value.trim().toLowerCase();
  const trimmedName = newName.value.trim();
  if (!trimmedCode || !trimmedName || !newUnit.value) return;
  if (isDuplicateName(trimmedName, newUnit.value)) {
    showToast(
      `A program named "${trimmedName}" already exists in ${unitLabels.value[newUnit.value]}.`,
      "error",
    );
    return;
  }
  adding.value = true;
  try {
    await addProgram(trimmedCode, trimmedName, newUnit.value);
    showToast(`Program "${trimmedName}" added`, "success");
    newCode.value = "";
    newName.value = "";
    showAddForm.value = false;
    await refreshPrograms();
  } catch {
    showToast("Could not add program.", "error");
  } finally {
    adding.value = false;
  }
}

async function handleRename(prog: ProgramRecord) {
  const updated = await promptAction({
    title: "Rename Program",
    message: `Current name: "${prog.name}"`,
    defaultValue: prog.name,
    placeholder: "New program name",
  });
  if (!updated) return;
  const trimmed = updated.trim();
  if (isDuplicateName(trimmed, prog.unit, prog.id)) {
    showToast(
      `A program named "${trimmed}" already exists in ${unitLabels.value[prog.unit]}.`,
      "error",
    );
    return;
  }
  try {
    await renameProgram(prog.id, trimmed);
    await refreshPrograms();
    showToast(`Program renamed to "${trimmed}"`, "success");
  } catch {
    showToast("Could not rename program.", "error");
  }
}

async function handleToggle(prog: ProgramRecord) {
  const action = prog.retired ? "reactivate" : "retire";
  const ok = await confirmAction({
    title: action === "retire" ? "Retire Program" : "Reactivate Program",
    message: `Are you sure you want to ${action} "${prog.name}"?`,
    confirmLabel: action === "retire" ? "Retire" : "Reactivate",
    danger: action === "retire",
  });
  if (!ok) return;
  try {
    await toggleProgramStatus(prog.id);
    await refreshPrograms();
    showToast(
      `"${prog.name}" ${action === "retire" ? "retired" : "reactivated"}`,
      "success",
    );
  } catch {
    showToast("Could not update program.", "error");
  }
}

const isChief = computed(() => currentRole.value === "chief");
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Programs</h1>
      <p class="text-white/80 text-sm mt-1">
        The registry of programs staff, files, and folders are organized under.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <button
        v-if="isChief"
        @click="showAddForm = !showAddForm"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition mb-6"
      >
        + Add Program
      </button>

      <div
        v-if="isChief && showAddForm"
        class="bg-white border border-black/10 rounded-lg p-5 mb-6"
      >
        <div class="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label
              for="add-program-code"
              class="block text-sm font-medium mb-1"
              >Code</label
            >
            <input
              id="add-program-code"
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
              for="add-program-name"
              class="block text-sm font-medium mb-1"
              >Program Name</label
            >
            <input
              id="add-program-name"
              v-model="newName"
              type="text"
              placeholder="e.g. New Program Name"
              class="w-full border border-black/20 rounded p-2 text-sm"
            />
          </div>
          <div>
            <label
              for="add-program-unit"
              class="block text-sm font-medium mb-1"
              >Unit</label
            >
            <select
              id="add-program-unit"
              v-model="newUnit"
              class="w-full border border-black/20 rounded p-2 text-sm"
            >
              <option value="" disabled>Select a unit</option>
              <option v-for="u in activeUnits" :key="u.code" :value="u.code">
                {{ u.name }}
              </option>
            </select>
          </div>
        </div>
        <button
          @click="handleAdd"
          :disabled="adding"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ adding ? "Saving..." : "Save Program" }}
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
            v-model="programFilter"
            type="text"
            placeholder="Filter by name or code..."
            class="w-full border border-black/20 rounded px-3 py-1.5 pr-7 text-sm focus:outline-none focus:border-dole-blue"
          />
          <button
            v-if="programFilter"
            @click="programFilter = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-black/60 hover:text-black/70 text-sm leading-none"
            aria-label="Clear filter"
          >
            ✕
          </button>
        </div>
        <p
          v-if="programs.length === 0 && programFilter.trim()"
          class="text-sm text-black/50"
        >
          No programs match "{{ programFilter }}".
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
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="prog in programs"
                :key="prog.id"
                class="border-b border-black/5 last:border-0"
                :class="prog.retired ? 'opacity-50' : ''"
              >
                <td class="p-3 font-medium">{{ prog.name }}</td>
                <td class="p-3 text-black/60 font-mono text-xs">
                  {{ prog.code }}
                </td>
                <td class="p-3 text-black/60">
                  {{ unitLabels[prog.unit] ?? prog.unit }}
                </td>
                <td class="p-3">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full"
                    :class="
                      !prog.retired
                        ? 'bg-green-100 text-green-700'
                        : 'bg-black/10 text-black/50'
                    "
                  >
                    {{ prog.retired ? "Retired" : "Active" }}
                  </span>
                </td>
                <td class="p-3 text-right space-x-3">
                  <router-link
                    :to="{ name: 'program-profile', params: { programCode: prog.code } }"
                    class="text-xs text-dole-blue hover:underline"
                  >
                    View
                  </router-link>
                  <template v-if="isChief">
                    <button
                      @click="handleRename(prog)"
                      class="text-xs text-dole-blue hover:underline"
                    >
                      Rename
                    </button>
                    <button
                      @click="handleToggle(prog)"
                      class="text-xs text-dole-red hover:underline"
                    >
                      {{ prog.retired ? "Reactivate" : "Retire" }}
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>
