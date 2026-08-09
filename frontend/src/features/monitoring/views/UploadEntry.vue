<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import * as XLSX from "xlsx";
import { useRouter } from "vue-router";
import { getProgram } from "../data/mockMonitoring";
import {
  hasParser,
  parseWorkbookForProgram,
  type ParseResult,
} from "../parsers";
import { uploadFile } from "../data/fileStore";
import { getFolders, type FolderRecord } from "../data/folderStore";
import { currentRole } from "../role";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const { showToast } = useToast();
const router = useRouter();
const props = defineProps<{ programId: string }>();
const saving = ref(false);
const saveError = ref<string | null>(null);

const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  { label: "Upload New File" },
]);

if (currentRole.value !== "staff") {
  router.replace({
    name: "program-periods",
    params: { programId: props.programId },
  });
}

const program = computed(() => getProgram(props.programId));
const parserAvailable = computed(() => hasParser(props.programId));

// --- Folder picker ---
interface FolderOption {
  id: number;
  label: string; // indented to reflect depth, e.g. "— — 2026 / Mid-Year"
}

const folders = ref<FolderRecord[]>([]);
const folderOptions = ref<FolderOption[]>([]);
const selectedFolderId = ref<number | "">(""); // "" = unfiled / root

async function loadFolders() {
  try {
    folders.value = await getFolders(props.programId);
    folderOptions.value = buildFolderOptions(folders.value);
  } catch {
    // If folders can't load, uploading still works — it just defaults to
    // "unfiled" rather than blocking the whole upload flow.
    folderOptions.value = [];
  }
}

function buildFolderOptions(all: FolderRecord[]): FolderOption[] {
  const byParent = new Map<number | null, FolderRecord[]>();
  for (const f of all) {
    const key = f.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const options: FolderOption[] = [];
  function walk(parentId: number | null, depth: number) {
    for (const folder of byParent.get(parentId) ?? []) {
      options.push({
        id: folder.id,
        label: "—".repeat(depth) + (depth > 0 ? " " : "") + folder.name,
      });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);
  return options;
}

onMounted(loadFolders);

const selectedFile = ref<File | null>(null);
const parsing = ref(false);
const result = ref<ParseResult | null>(null);
const error = ref<string | null>(null);
const lastFileBuffer = ref<ArrayBuffer | null>(null);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  result.value = null;
  error.value = null;
}

async function handleParse() {
  if (!selectedFile.value) return;
  parsing.value = true;
  error.value = null;
  try {
    const buffer = await selectedFile.value.arrayBuffer();
    lastFileBuffer.value = buffer;
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    result.value = parseWorkbookForProgram(props.programId, wb);
  } catch (e) {
    error.value =
      "Could not read this file. Make sure it is a valid .xlsx file.";
  } finally {
    parsing.value = false;
  }
}

async function handleConfirmSave() {
  if (!result.value || !selectedFile.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await uploadFile(
      props.programId,
      selectedFolderId.value === "" ? null : selectedFolderId.value,
      selectedFile.value,
      {
        periods: result.value.periods,
        warnings: result.value.warnings,
        quarterly: result.value.quarterly,
        unutilizedFunds: result.value.unutilizedFunds,
      },
    );
    showToast(`"${selectedFile.value.name}" uploaded successfully`, "success");
    router.push({
      name: "program-periods",
      params: { programId: props.programId },
    });
  } catch (e) {
    saveError.value =
      "Could not save this file. Check your connection and try again.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        Upload {{ program.name }} File
      </h1>
    </header>

    <main class="max-w-3xl mx-auto px-8 py-10">
      <div
        v-if="!parserAvailable"
        class="bg-dole-red/10 border border-dole-red/30 text-dole-red rounded-lg p-4 mb-6"
      >
        Auto-parsing isn't built for {{ program.name }} yet — this program isn't
        wired up to a parser.
      </div>

      <div class="bg-white border border-black/10 rounded-lg p-6">
        <label class="block text-sm font-medium mb-2"
          >Save into folder (optional)</label
        >
        <select
          v-model="selectedFolderId"
          class="block w-full text-sm border border-black/20 rounded p-2 mb-4"
        >
          <option value="">— Unfiled (program root) —</option>
          <option v-for="opt in folderOptions" :key="opt.id" :value="opt.id">
            {{ opt.label }}
          </option>
        </select>

        <label class="block text-sm font-medium mb-2"
          >Select the {{ program.name }} monitoring file (.xlsx)</label
        >
        <input
          type="file"
          accept=".xlsx"
          @change="onFileChange"
          class="block w-full text-sm border border-black/20 rounded p-2"
        />

        <button
          v-if="selectedFile && parserAvailable"
          @click="handleParse"
          :disabled="parsing"
          class="mt-4 bg-dole-blue text-white px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ parsing ? "Reading file…" : "Analyze File" }}
        </button>

        <p v-if="error" class="text-dole-red text-sm mt-3">{{ error }}</p>
      </div>

      <div
        v-if="result"
        class="mt-6 bg-white border border-black/10 rounded-lg p-6"
      >
        <h2 class="font-display text-lg font-semibold text-dole-blue mb-3">
          Preview before saving
        </h2>

        <div
          v-if="result.warnings.length"
          class="bg-dole-gold/10 border border-dole-gold/40 rounded p-3 mb-4"
        >
          <p class="text-sm font-medium mb-1">Heads up:</p>
          <ul class="text-sm list-disc pl-5">
            <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>

        <div
          v-for="entry in result.periods"
          :key="entry.scope"
          class="mb-4 last:mb-0 border-b border-black/5 pb-3 last:border-0"
        >
          <p class="font-medium">
            {{ entry.scope }}
            <span class="text-black/50 text-sm">({{ entry.label }})</span>
          </p>
          <p
            v-for="m in entry.metrics"
            :key="m.key"
            class="text-sm text-black/70"
          >
            {{ m.label }}: {{ m.actual.toLocaleString() }}
            <span v-if="m.target !== null"
              >/ Target: {{ m.target.toLocaleString() }}</span
            >
            <span v-else class="italic text-black/40">/ Target: TBD</span>
          </p>
        </div>

        <button
          @click="handleConfirmSave"
          :disabled="saving"
          class="mt-4 bg-dole-blue text-white px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ saving ? "Saving…" : "Confirm & Save" }}
        </button>
        <p v-if="saveError" class="text-dole-red text-sm mt-3">
          {{ saveError }}
        </p>
      </div>
    </main>
  </div>
</template>
