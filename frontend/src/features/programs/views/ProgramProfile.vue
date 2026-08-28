<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import {
  getProgramProfile,
  updateProgramProfile,
  type ProgramRecord,
  type ProgramStaffMember,
} from "../data/programStore";
import { ensureUnitsLoaded, unitLabels } from "../../units/data/unitCache";
import { currentRole } from "../../monitoring/role";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const props = defineProps<{ programCode: string }>();
const { showToast } = useToast();

const program = ref<ProgramRecord | null>(null);
const staff = ref<ProgramStaffMember[]>([]);
const loading = ref(true);
const loadError = ref("");

const isChief = computed(() => currentRole.value === "chief");

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await getProgramProfile(props.programCode);
    program.value = result.program;
    staff.value = result.staff;
  } catch {
    loadError.value = "Could not load this program.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onMounted(ensureUnitsLoaded);
watch(() => props.programCode, load);

const crumbs = computed<Crumb[]>(() => [
  { label: "Programs", to: { name: "programs" } },
  { label: program.value?.name ?? props.programCode },
]);

// --- Chief edit mode ---
const editing = ref(false);
const saving = ref(false);
const draftFoundedAt = ref("");
const draftVision = ref("");
const draftMission = ref("");
const draftScope = ref("");

function startEditing() {
  if (!program.value) return;
  draftFoundedAt.value = program.value.founded_at ?? "";
  draftVision.value = program.value.vision ?? "";
  draftMission.value = program.value.mission ?? "";
  draftScope.value = program.value.scope ?? "";
  editing.value = true;
}

function cancelEditing() {
  editing.value = false;
}

async function saveProfile() {
  if (!program.value) return;
  saving.value = true;
  try {
    program.value = await updateProgramProfile(program.value.code, {
      founded_at: draftFoundedAt.value || null,
      vision: draftVision.value.trim() || null,
      mission: draftMission.value.trim() || null,
      scope: draftScope.value.trim() || null,
    });
    editing.value = false;
    showToast("Profile updated", "success");
  } catch {
    showToast("Could not save the profile. Try again.", "error");
  } finally {
    saving.value = false;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program?.name ?? props.programCode }}
      </h1>
    </header>

    <main class="max-w-3xl mx-auto px-8 py-10">
      <p v-if="loading" class="text-sm text-black/50">Loading…</p>
      <p v-else-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

      <template v-else-if="program">
        <div class="bg-white border border-black/10 rounded-lg p-6 mb-6">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <p class="text-sm text-black/50">
                {{ unitLabels[program.unit] ?? program.unit }}
                <span class="mx-1">·</span>
                <span class="font-mono text-xs">{{ program.code }}</span>
              </p>
              <p v-if="program.founded_at && !editing" class="text-sm text-black/60 mt-1">
                Founded {{ formatDate(program.founded_at) }}
              </p>
            </div>
            <button
              v-if="isChief && !editing"
              @click="startEditing"
              class="text-sm text-dole-blue hover:underline shrink-0"
            >
              Edit profile
            </button>
          </div>

          <template v-if="editing">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Founded</label>
                <input
                  v-model="draftFoundedAt"
                  type="date"
                  class="border border-black/20 rounded p-2 text-sm"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Vision</label>
                <textarea
                  v-model="draftVision"
                  rows="3"
                  class="w-full border border-black/20 rounded p-2 text-sm"
                ></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Mission</label>
                <textarea
                  v-model="draftMission"
                  rows="3"
                  class="w-full border border-black/20 rounded p-2 text-sm"
                ></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Scope</label>
                <textarea
                  v-model="draftScope"
                  rows="3"
                  class="w-full border border-black/20 rounded p-2 text-sm"
                ></textarea>
              </div>
            </div>
            <div class="flex gap-3 mt-4">
              <button
                @click="saveProfile"
                :disabled="saving"
                class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
              >
                {{ saving ? "Saving…" : "Save" }}
              </button>
              <button
                @click="cancelEditing"
                :disabled="saving"
                class="text-sm text-black/60 hover:underline"
              >
                Cancel
              </button>
            </div>
          </template>

          <div v-else class="grid sm:grid-cols-3 gap-5 mt-2">
            <div>
              <p class="text-xs font-medium text-black/50 mb-1">Vision</p>
              <p
                class="text-sm leading-relaxed"
                :class="!program.vision ? 'italic text-black/40' : ''"
              >
                {{ program.vision || "Not set yet." }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-black/50 mb-1">Mission</p>
              <p
                class="text-sm leading-relaxed"
                :class="!program.mission ? 'italic text-black/40' : ''"
              >
                {{ program.mission || "Not set yet." }}
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-black/50 mb-1">Scope</p>
              <p
                class="text-sm leading-relaxed"
                :class="!program.scope ? 'italic text-black/40' : ''"
              >
                {{ program.scope || "Not set yet." }}
              </p>
            </div>
          </div>
        </div>

        <div class="bg-white border border-black/10 rounded-lg p-6">
          <p class="text-sm font-medium mb-4">Staff ({{ staff.length }})</p>
          <p v-if="staff.length === 0" class="text-sm text-black/40 italic">
            No staff currently assigned to this program.
          </p>
          <div v-else class="grid sm:grid-cols-2 gap-4">
            <div
              v-for="member in staff"
              :key="member.id"
              class="flex items-center gap-3"
            >
              <div
                class="w-9 h-9 rounded-full bg-dole-blue/10 text-dole-blue flex items-center justify-center text-xs font-semibold shrink-0"
              >
                {{ initials(member.name) }}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium truncate">{{ member.name }}</p>
                <p class="text-xs text-black/50 truncate">
                  {{ member.position || "Program staff" }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
