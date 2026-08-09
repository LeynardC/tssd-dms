<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getProgram, balance, type Metric } from "../data/mockMonitoring";
import { getFileById } from "../data/fileStore";
import type { ParsedFileData } from "../composables/useProgramFiles";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import { formatCurrency } from "../../../utils/format";

const props = defineProps<{ programId: string; uploadId: string }>();
const program = computed(() => getProgram(props.programId));

const loading = ref(true);
const error = ref<string | null>(null);
const fileName = ref("");
const uploadedAt = ref("");
const uploadedByName = ref("");
const parsedData = ref<ParsedFileData | null>(null);

const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  { label: "Historical Upload" },
]);

onMounted(async () => {
  loading.value = true;
  error.value = null;
  try {
    const id = Number(props.uploadId);
    const file = await getFileById(id);
    fileName.value = file.original_name;
    uploadedAt.value = file.created_at;
    uploadedByName.value = file.uploader?.name ?? "Unknown";

    if (
      !file.parsed_data ||
      !Array.isArray((file.parsed_data as any).periods)
    ) {
      error.value = "This file has no monitoring data attached.";
    } else {
      parsedData.value = file.parsed_data as unknown as ParsedFileData;
    }
  } catch (e) {
    error.value =
      "Could not load this upload. Check your connection and try again.";
  } finally {
    loading.value = false;
  }
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatValue(m: Metric): string {
  if (m.unit === "currency") return formatCurrency(m.actual);
  if (m.unit === "days") return m.actual.toFixed(2) + " days";
  return m.actual.toLocaleString();
}
function formatTarget(m: Metric): string {
  if (m.target === null) return "TBD";
  if (m.unit === "currency") return formatCurrency(m.target);
  if (m.unit === "days") return m.target.toFixed(2) + " days";
  return m.target.toLocaleString();
}
function formatBalance(m: Metric): string {
  const b = balance(m.target, m.actual);
  if (b === null) return "—";
  if (m.unit === "currency") return formatCurrency(b);
  if (m.unit === "days") return b.toFixed(2) + " days";
  return b.toLocaleString();
}
function progressPct(m: Metric): number {
  if (m.target === null || m.target === 0) return 0;
  return Math.min((m.actual / m.target) * 100, 100);
}
function handlePrint() {
  window.print();
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md print:hidden">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.fullName }} — Historical Upload
      </h1>
      <p v-if="!loading && parsedData" class="text-white/70 text-xs mt-2">
        Source: {{ fileName }} • Uploaded {{ formatDate(uploadedAt) }} by
        {{ uploadedByName }}
      </p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <div v-if="loading" class="text-black/50 text-sm">Loading…</div>

      <div
        v-else-if="error"
        class="bg-dole-red/10 border border-dole-red/30 text-dole-red rounded-lg p-4"
      >
        {{ error }}
      </div>

      <template v-else-if="parsedData">
        <div class="flex justify-end mb-6 print:hidden">
          <button
            @click="handlePrint"
            class="text-sm border border-dole-blue text-dole-blue px-3 py-1.5 rounded hover:bg-dole-blue hover:text-white transition"
          >
            Print
          </button>
        </div>

        <div
          v-if="parsedData.warnings.length"
          class="bg-dole-gold/10 border border-dole-gold/40 rounded p-3 mb-4"
        >
          <p class="text-sm font-medium mb-1">Warnings at time of upload:</p>
          <ul class="text-sm list-disc pl-5">
            <li v-for="(w, i) in parsedData.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>

        <div
          v-for="entry in parsedData.periods"
          :key="entry.scope"
          class="bg-white border border-black/10 rounded-lg p-6 mb-4"
        >
          <div class="flex justify-between items-baseline mb-4">
            <h2 class="font-display text-lg font-semibold text-dole-blue">
              {{ entry.scope }}
            </h2>
            <span class="text-sm text-black/50">{{ entry.label }}</span>
          </div>
          <div v-for="m in entry.metrics" :key="m.key" class="mb-4 last:mb-0">
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium">{{ m.label }}</span>
              <span
                :class="
                  m.isPlaceholder ? 'text-black/40 italic' : 'text-black/70'
                "
              >
                {{ formatValue(m) }} / Target: {{ formatTarget(m) }}
              </span>
            </div>
            <div class="w-full bg-black/5 rounded-full h-2">
              <div
                class="h-2 rounded-full"
                :class="m.isPlaceholder ? 'bg-black/20' : 'bg-dole-blue'"
                :style="{ width: progressPct(m) + '%' }"
              />
            </div>
            <p v-if="m.target !== null" class="text-xs text-black/50 mt-1">
              Balance to reach target: {{ formatBalance(m) }}
            </p>
          </div>
          <p
            v-if="entry.note"
            class="text-xs text-dole-red/80 mt-3 italic border-t border-black/5 pt-3"
          >
            {{ entry.note }}
          </p>
        </div>
      </template>
    </main>
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
