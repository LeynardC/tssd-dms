<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram } from "../data/mockMonitoring";
import {
  getPeriodsWithSource,
  getUploadedFiles,
  deleteUploadedFile,
  getUploadById,
} from "../data/uploadStore";

import { currentRole } from "../role";
import RoleBadge from "../components/RoleBadge.vue";
import { useConfirm } from "../../../composables/useConfirm";
import Modal from "../../../components/Modal.vue";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const { confirmAction } = useConfirm();

const props = defineProps<{ programId: string }>();
const program = computed(() => getProgram(props.programId));
const refreshKey = ref(0);
const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  { label: program.value?.name ?? "" },
]);

const allUploads = computed(() => {
  refreshKey.value;
  return [...getUploadedFiles(props.programId)].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );
});

function periodId(p: { year: number; quarter?: string }): string {
  return p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface PeriodCard {
  id: string;
  label: string;
  fileName: string;
  uploadedAt: string;
  warningCount: number;
}

const uniquePeriods = computed<PeriodCard[]>(() => {
  refreshKey.value;
  const entries = getPeriodsWithSource(props.programId);
  const seen = new Map<string, PeriodCard>();
  entries.forEach(({ period, file }) => {
    const id = periodId(period);
    const existing = seen.get(id);
    if (!existing || file.uploadedAt > existing.uploadedAt) {
      seen.set(id, {
        id,
        label: period.label,
        fileName: file.fileName,
        uploadedAt: file.uploadedAt,
        warningCount: file.warnings.length,
      });
    }
  });
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id));
});

async function handleDelete(id: string) {
  const ok = await confirmAction({
    title: "Remove Uploaded File",
    message: "Remove this uploaded file from history? This cannot be undone.",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return;
  deleteUploadedFile(props.programId, id);
  refreshKey.value++;
}

function handleDownload(id: string) {
  const file = getUploadById(props.programId, id);
  if (!file?.fileBase64) {
    return;
  }
  const binary = atob(file.fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
const showDownloadPreview = ref(false);
const downloadTargetId = ref<string | null>(null);

const previewFile = computed(() => {
  if (!downloadTargetId.value) return null;
  return getUploadById(props.programId, downloadTargetId.value);
});

function openDownloadPreview(id: string) {
  downloadTargetId.value = id;
  showDownloadPreview.value = true;
}

function confirmDownload() {
  if (downloadTargetId.value) handleDownload(downloadTargetId.value);
  showDownloadPreview.value = false;
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <div class="flex justify-end mb-2">
        <RoleBadge />
      </div>

      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.fullName }}
      </h1>
      <p class="text-white/80 text-sm mt-1">{{ program.description }}</p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <p class="text-sm text-black/60 mb-4">
        Select a period to view its dashboard ({{ program.granularity }}
        reporting):
      </p>

      <router-link
        v-if="currentRole === 'staff'"
        :to="{ name: 'upload-entry', params: { programId: program.id } }"
        class="inline-block mb-6 bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
      >
        + Upload New File
      </router-link>

      <router-link
        :to="{ name: 'file-explorer', params: { programId: program.id } }"
        class="inline-block mb-6 ml-3 border border-dole-blue text-dole-blue text-sm px-4 py-2 rounded hover:bg-dole-blue/5 transition"
      >
        📁 Manage Folders
      </router-link>

      <div
        v-if="allUploads.length"
        class="bg-white border border-black/10 rounded-lg p-4 mb-6"
      >
        <h2 class="font-display text-base font-semibold text-dole-blue mb-2">
          Upload History
        </h2>
        <div
          v-for="(file, i) in allUploads"
          :key="file.id"
          class="flex justify-between items-center py-2 border-b border-black/5 last:border-0"
        >
          <div>
            <p class="text-sm font-medium">
              {{ file.fileName }}
              <span
                v-if="i === 0"
                class="text-xs bg-dole-gold/20 text-dole-blue-dark px-2 py-0.5 rounded ml-2"
                >Latest</span
              >
            </p>
            <p class="text-xs text-black/50">
              {{ formatDate(file.uploadedAt) }} — {{ file.uploadedBy }}
            </p>
            <p
              v-if="file.warnings.length"
              class="text-xs text-dole-red/70 mt-0.5"
            >
              {{ file.warnings.length }} warning(s)
            </p>
          </div>
          <div class="flex items-center gap-3">
            <router-link
              :to="{
                name: 'upload-history-view',
                params: { programId: program.id, uploadId: file.id },
              }"
              class="text-xs text-dole-blue hover:underline"
              >View</router-link
            >
            <button
              v-if="file.fileBase64"
              @click="openDownloadPreview(file.id)"
              class="text-xs text-dole-blue hover:underline"
            >
              Download
            </button>
            <button
              v-if="currentRole === 'staff'"
              @click="handleDelete(file.id)"
              class="text-xs text-dole-red hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="uniquePeriods.length === 0"
        class="bg-white border border-black/10 border-dashed rounded-lg p-8 text-center"
      >
        <p class="text-black/50 text-sm">
          No data has been uploaded yet for {{ program.name }}.
        </p>
        <p class="text-black/40 text-xs mt-1">
          Use "+ Upload New File" above to add the first monitoring file.
        </p>
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-3">
        <router-link
          v-for="p in uniquePeriods"
          :key="p.id"
          :to="{
            name: 'period-scopes',
            params: { programId: program.id, periodId: p.id },
          }"
          class="block bg-white border border-black/10 rounded-lg p-4 hover:border-dole-blue hover:shadow-md transition"
        >
          <div class="flex items-center justify-between">
            <p class="font-semibold text-dole-blue">{{ p.label }}</p>
            <span
              v-if="p.warningCount > 0"
              class="text-[11px] bg-dole-red/10 text-dole-red px-2 py-0.5 rounded-full font-medium"
              :title="p.warningCount + ' warning(s) at time of upload'"
            >
              ⚠ {{ p.warningCount }}
            </span>
          </div>
          <p class="text-xs text-black/50 mt-1">from "{{ p.fileName }}"</p>
        </router-link>
      </div>
    </main>
    <Modal
      v-if="showDownloadPreview && previewFile"
      :title="previewFile.fileName"
      @close="showDownloadPreview = false"
    >
      <p class="text-xs text-black/50 mb-3">
        Uploaded {{ formatDate(previewFile.uploadedAt) }} by
        {{ previewFile.uploadedBy }}
      </p>
      <div
        v-if="previewFile.warnings.length"
        class="bg-dole-gold/10 border border-dole-gold/40 rounded p-3 mb-4"
      >
        <p class="text-sm font-medium mb-1">Warnings at time of upload:</p>
        <ul class="text-sm list-disc pl-5">
          <li v-for="(w, i) in previewFile.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-black/50 border-b border-black/10">
            <th class="pb-2">Scope</th>
            <th class="pb-2">Metric</th>
            <th class="pb-2">Actual</th>
            <th class="pb-2">Target</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in previewFile.periods" :key="entry.scope">
            <tr
              v-for="m in entry.metrics"
              :key="entry.scope + m.key"
              class="border-b border-black/5"
            >
              <td class="py-1.5 font-medium">{{ entry.scope }}</td>
              <td class="py-1.5">{{ m.label }}</td>
              <td class="py-1.5">{{ m.actual.toLocaleString() }}</td>
              <td class="py-1.5">
                {{ m.target !== null ? m.target.toLocaleString() : "TBD" }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <template #footer>
        <button
          @click="showDownloadPreview = false"
          class="text-sm text-black/60 px-4 py-2 hover:text-black"
        >
          Cancel
        </button>
        <button
          @click="confirmDownload"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          Confirm &amp; Download
        </button>
      </template>
    </Modal>
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
