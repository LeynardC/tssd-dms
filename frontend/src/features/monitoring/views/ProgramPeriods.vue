<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram } from "../data/mockMonitoring";
import { useProgramFiles } from "../composables/useProgramFiles";
import {
  deleteFile,
  getDownloadUrl,
  isPreviewable,
  type FileRecord,
} from "../data/fileStore";
import PreviewModal from "../components/PreviewModal.vue";

import { currentRole } from "../role";
import RoleBadge from "../components/RoleBadge.vue";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const { confirmAction } = useConfirm();
const { showToast } = useToast();

const props = defineProps<{ programId: string }>();
const program = computed(() => getProgram(props.programId));
const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  { label: program.value?.name ?? "" },
]);

const { allFiles, periods, loading, error, refresh } = useProgramFiles(
  computed(() => props.programId),
);

const sortedFiles = computed(() =>
  [...allFiles.value].sort((a, b) => b.created_at.localeCompare(a.created_at)),
);

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

function hasParsedData(file: FileRecord): boolean {
  return !!file.parsed_data && Array.isArray((file.parsed_data as any).periods);
}

function warningCount(file: FileRecord): number {
  const warnings = (file.parsed_data as any)?.warnings;
  return Array.isArray(warnings) ? warnings.length : 0;
}

interface PeriodCard {
  id: string;
  label: string;
  fileName: string;
  uploadedAt: string;
  warningCount: number;
}

const uniquePeriods = computed<PeriodCard[]>(() => {
  const seen = new Map<string, PeriodCard>();
  periods.value.forEach(({ period, file }) => {
    const id = periodId(period);
    const existing = seen.get(id);
    if (!existing || file.uploadedAt > existing.uploadedAt) {
      seen.set(id, {
        id,
        label: period.label,
        fileName: file.fileName,
        uploadedAt: file.uploadedAt,
        warningCount: file.data.warnings.length,
      });
    }
  });
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id));
});

async function handleDelete(file: FileRecord) {
  const ok = await confirmAction({
    title: "Delete File",
    message: `Delete "${file.original_name}"? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteFile(file.id);
    showToast(`"${file.original_name}" deleted`, "success");
    refresh();
  } catch {
    showToast("Could not delete this file. Please try again.", "error");
  }
}

const previewTarget = ref<FileRecord | null>(null);
function openPreview(file: FileRecord) {
  previewTarget.value = file;
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
      <div v-if="loading" class="text-black/50 text-sm mb-4">Loading…</div>

      <div
        v-else-if="error"
        class="bg-dole-red/10 border border-dole-red/30 text-dole-red rounded-lg p-4 mb-6"
      >
        {{ error }}
      </div>

      <template v-else>
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

        <div
          v-if="sortedFiles.length"
          class="bg-white border border-black/10 rounded-lg p-4 mb-6"
        >
          <h2 class="font-display text-base font-semibold text-dole-blue mb-2">
            Upload History
          </h2>
          <div class="max-h-40 overflow-y-auto pr-1">
            <div
              v-for="(file, i) in sortedFiles"
              :key="file.id"
              class="flex justify-between items-center py-2 border-b border-black/5 last:border-0"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ file.original_name }}
                  <span
                    v-if="i === 0"
                    class="text-xs bg-dole-gold/20 text-dole-blue-dark px-2 py-0.5 rounded ml-2"
                    >Latest</span
                  >
                </p>
                <p class="text-xs text-black/50">
                  {{ formatDate(file.created_at) }} —
                  {{ file.uploader?.name ?? "Unknown" }}
                </p>
                <p
                  v-if="hasParsedData(file) && warningCount(file) > 0"
                  class="text-xs text-dole-red/70 mt-0.5"
                >
                  {{ warningCount(file) }} warning(s)
                </p>
              </div>
              <div class="flex items-center gap-3">
                <router-link
                  v-if="hasParsedData(file)"
                  :to="{
                    name: 'upload-history-view',
                    params: { programId: program.id, uploadId: file.id },
                  }"
                  class="text-xs text-dole-blue hover:underline"
                  >View Data</router-link
                >
                <button
                  v-if="isPreviewable(file.mime_type)"
                  @click="openPreview(file)"
                  class="text-xs text-dole-blue hover:underline"
                >
                  Preview
                </button>

                <a
                  :href="getDownloadUrl(file.id)"
                  target="_blank"
                  class="text-xs text-dole-blue hover:underline"
                >
                  Download
                </a>
                <button
                  v-if="currentRole === 'staff'"
                  @click="handleDelete(file)"
                  class="text-xs text-dole-red hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="uniquePeriods.length === 0"
          class="bg-white border border-black/10 border-dashed rounded-lg p-8 text-center"
        >
          <p class="text-black/50 text-sm">
            No monitoring data has been uploaded yet for {{ program.name }}.
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
      </template>
    </main>

    <PreviewModal
      v-if="previewTarget"
      :file="previewTarget"
      @close="previewTarget = null"
    />
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
