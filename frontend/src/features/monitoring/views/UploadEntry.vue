<script setup lang="ts">
import { ref, computed } from "vue";
import * as XLSX from "xlsx";
import { useRouter } from "vue-router";
import { getProgram } from "../data/mockMonitoring";
import {
  hasParser,
  parseWorkbookForProgram,
  type ParseResult,
} from "../parsers";
import { uploadFileWithProgress, replaceFile } from "../data/fileStore";
import {
  queueUpload,
  removeQueuedUpload,
} from "../data/uploadQueue";
import { getFolders } from "../data/folderStore";
import { currentRole } from "../role";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import {
  useProgramFiles,
  findShadowedPeriods,
  singleShadowedFileId,
  type ShadowedPeriod,
} from "../composables/useProgramFiles";
import FolderPickerModal from "../components/FolderPickerModal.vue";
import { Folder } from "@lucide/vue";

const { showToast } = useToast();
const router = useRouter();
const props = defineProps<{ programId: string }>();
const saving = ref(false);
const saveError = ref<string | null>(null);
const uploadProgress = ref(0);
const { periods: existingPeriods } = useProgramFiles(props.programId);

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
const selectedFile = ref<File | null>(null);
const parsing = ref(false);
const result = ref<ParseResult | null>(null);
const error = ref<string | null>(null);
const lastFileBuffer = ref<ArrayBuffer | null>(null);

// --- Folder picker (browse-style modal) ---
const selectedFolderId = ref<number | null>(null);
const selectedFolderLabel = ref("Root (program root)");
const showFolderPicker = ref(false);

function handleFolderSelected(folderId: number | null) {
  selectedFolderId.value = folderId;
  showFolderPicker.value = false;
  // Re-fetch folder path label so the button reflects the real chosen name,
  // not just an id — reuse getFolders() since it's already available.
  if (folderId === null) {
    selectedFolderLabel.value = "Root (program root)";
  } else {
    getFolders(props.programId).then((all) => {
      const path: string[] = [];
      let current = all.find((f) => f.id === folderId);
      while (current) {
        path.unshift(current.name);
        current = all.find((f) => f.id === current!.parent_id);
      }
      selectedFolderLabel.value = path.join(" / ");
    });
  }
}

const shadowWarnings = computed<ShadowedPeriod[]>(() =>
  result.value
    ? findShadowedPeriods(existingPeriods.value, result.value.periods)
    : [],
);

// If every shadowed period traces back to the same existing file, that file
// is unambiguously "the older version of this data" — safe to replace
// outright instead of piling up a separate, disconnected new file.
const replaceTargetId = computed<number | null>(() =>
  singleShadowedFileId(shadowWarnings.value),
);

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
    if (!isLikelyXlsx(buffer)) {
      error.value =
        "This doesn't look like a valid .xlsx file. Please check the file and try again.";
      return;
    }
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

function isLikelyXlsx(buffer: ArrayBuffer): boolean {
  // .xlsx files are ZIP archives — every real ZIP starts with the bytes
  // 'PK' (0x50, 0x4B). This won't catch every possible corruption, but it
  // reliably rejects renamed non-Excel files (.txt, .pdf, etc.) before we
  // ever hand them to the parser.
  const bytes = new Uint8Array(buffer.slice(0, 2));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function handleConfirmSave() {
  if (!result.value || !selectedFile.value) return;
  saving.value = true;
  saveError.value = null;
  uploadProgress.value = 0;
  const parsedData = {
    periods: result.value.periods,
    warnings: result.value.warnings,
    quarterly: result.value.quarterly,
    unutilizedFunds: result.value.unutilizedFunds,
    lguRates: result.value.lguRates,
  };
  // Queued BEFORE attempting the network call, the same way File Explorer's
  // upload flow now does — this is IndexedDB-backed and survives a closed
  // browser or power loss, so a crash mid-save doesn't lose the file with no
  // trace. A normal successful save removes it again immediately below.
  const queuedId = await queueUpload({
    programId: props.programId,
    folderId: selectedFolderId.value,
    file: selectedFile.value,
    parsedData,
    replaceTargetId: replaceTargetId.value ?? undefined,
  });
  try {
    if (replaceTargetId.value !== null) {
      // This file's data unambiguously belongs to the same period/scope as
      // an existing file — update that file in place (logged as a new
      // version) instead of leaving the old one behind as clutter.
      await replaceFile(
        replaceTargetId.value,
        selectedFile.value,
        (percent) => {
          uploadProgress.value = percent;
        },
        parsedData,
      );
      showToast(
        `"${selectedFile.value.name}" replaced the existing file for this period.`,
        "success",
      );
    } else {
      await uploadFileWithProgress(
        props.programId,
        selectedFolderId.value,
        selectedFile.value,
        (percent) => {
          uploadProgress.value = percent;
        },
        parsedData,
      );
      showToast(`"${selectedFile.value.name}" uploaded successfully`, "success");
    }
    await removeQueuedUpload(queuedId);
    router.push({
      name: "program-periods",
      params: { programId: props.programId },
    });
  } catch (e) {
    const isNetworkError =
      e instanceof TypeError || (e as any)?.status === undefined;
    if (isNetworkError) {
      // Leave it queued — File Explorer's "N waiting to upload" indicator
      // will pick it up and retry automatically once back online, whether
      // this was a create or a replace.
      showToast(
        `"${selectedFile.value.name}" saved — connection issue. Will retry automatically.`,
        "success",
      );
      router.push({
        name: "program-periods",
        params: { programId: props.programId },
      });
    } else {
      // A real, permanent failure (locked file, validation, etc.) — retrying
      // won't help, so don't leave it silently stuck in the queue, and stay
      // on this page so the user can see exactly what went wrong.
      await removeQueuedUpload(queuedId);
      saveError.value =
        e instanceof Error
          ? e.message
          : "Could not save this file. Check your connection and try again.";
    }
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
        <button
          type="button"
          @click="showFolderPicker = true"
          class="flex items-center gap-2 w-full text-left text-sm border border-black/20 rounded p-2 mb-4 hover:border-dole-blue transition"
        >
          <Folder :size="16" class="text-black/60 shrink-0" />
          <span class="truncate">{{ selectedFolderLabel }}</span>
        </button>

        <FolderPickerModal
          v-if="showFolderPicker"
          :program-id="props.programId"
          @close="showFolderPicker = false"
          @select="handleFolderSelected"
        />

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
          v-if="shadowWarnings.length"
          class="bg-dole-red/10 border border-dole-red/30 rounded p-3 mb-4"
        >
          <p class="text-sm font-medium text-dole-red mb-1">
            {{
              replaceTargetId !== null
                ? `This will replace "${shadowWarnings[0].fileName}" — saving here updates that file instead of creating a new one:`
                : "This will replace existing dashboard data for:"
            }}
          </p>
          <ul class="text-sm text-dole-red/90 list-disc pl-5">
            <li v-for="(w, i) in shadowWarnings" :key="i">
              {{ w.scope }} ({{ w.label }}) — currently from "{{
                w.fileName
              }}", uploaded by {{ w.uploadedBy }}
            </li>
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
            <span v-else class="italic text-black/60">/ Target: TBD</span>
          </p>
        </div>

        <button
          @click="handleConfirmSave"
          :disabled="saving"
          class="mt-4 bg-dole-blue text-white px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{
            saving
              ? `Saving… ${uploadProgress}%`
              : replaceTargetId !== null
                ? "Replace File & Save"
                : "Confirm & Save"
          }}
        </button>
        <p v-if="saveError" class="text-dole-red text-sm mt-3">
          {{ saveError }}
        </p>
      </div>
    </main>
  </div>
</template>
