<script setup lang="ts">
import { ref, computed } from "vue";
import {
  programs,
  balance,
  type PeriodEntry,
} from "../../monitoring/data/mockMonitoring";
import { getPeriodsWithSource } from "../../monitoring/data/uploadStore";
import { exportPeriodToExcel } from "../exportUtils";
import Modal from "../../../components/Modal.vue";
import { useToast } from "../../../composables/useToast";

const selectedProgramId = ref(programs[0]?.id ?? "");
const { showToast } = useToast();

function periodId(p: { year: number; quarter?: string }): string {
  return p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
}

interface PeriodOption {
  id: string;
  label: string;
}

const availablePeriods = computed<PeriodOption[]>(() => {
  const entries = getPeriodsWithSource(selectedProgramId.value);
  const seen = new Map<string, PeriodOption>();
  entries.forEach(({ period }) => {
    const id = periodId(period);
    if (!seen.has(id)) seen.set(id, { id, label: period.label });
  });
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id));
});

const selectedPeriodId = ref("");

function matchesPeriodId(
  p: { year: number; quarter?: string },
  id: string,
): boolean {
  return periodId(p) === id;
}

const exportReady = computed(
  () => selectedProgramId.value && selectedPeriodId.value,
);

const showPreview = ref(false);

const previewEntries = computed<PeriodEntry[]>(() => {
  if (!selectedPeriodId.value) return [];
  return getPeriodsWithSource(selectedProgramId.value)
    .filter(({ period }) => matchesPeriodId(period, selectedPeriodId.value))
    .map(({ period }) => period);
});

const selectedProgramName = computed(
  () => programs.find((p) => p.id === selectedProgramId.value)?.name ?? "",
);
const selectedPeriodLabel = computed(
  () =>
    availablePeriods.value.find((p) => p.id === selectedPeriodId.value)
      ?.label ?? "",
);

function openPreview() {
  if (!exportReady.value) return;
  if (previewEntries.value.length === 0) {
    showToast(
      "No data available for this program/period combination.",
      "error",
    );
    return;
  }
  showPreview.value = true;
}

function confirmDownload() {
  exportPeriodToExcel(
    selectedProgramName.value,
    selectedPeriodLabel.value,
    previewEntries.value,
  );
  showPreview.value = false;
}

function formatMetricValue(unit: string, value: number | string): string {
  if (typeof value !== "number") return String(value);
  if (unit === "currency")
    return "₱" + value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString();
}

function onProgramChange() {
  selectedPeriodId.value = "";
}
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Reports &amp; Exports</h1>
      <p class="text-white/80 text-sm mt-1">
        Download a program's monitoring data as an Excel file.
      </p>
    </header>

    <main class="max-w-2xl mx-auto px-8 py-8">
      <div class="bg-white border border-black/10 rounded-lg p-6">
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">Program</label>
          <select
            v-model="selectedProgramId"
            @change="onProgramChange"
            class="w-full border border-black/20 rounded p-2 text-sm"
          >
            <option v-for="p in programs" :key="p.id" :value="p.id">
              {{ p.name }} — {{ p.fullName }}
            </option>
          </select>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium mb-1">Period</label>
          <select
            v-model="selectedPeriodId"
            :disabled="availablePeriods.length === 0"
            class="w-full border border-black/20 rounded p-2 text-sm disabled:bg-black/5"
          >
            <option value="" disabled>
              {{
                availablePeriods.length
                  ? "Select a period"
                  : "No data uploaded yet"
              }}
            </option>
            <option v-for="p in availablePeriods" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
          </select>
        </div>

        <button
          @click="openPreview"
          :disabled="!exportReady"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Preview Export
        </button>
      </div>

      <p class="text-xs text-black/40 italic mt-4">
        The exported file includes every province's target, actual, balance, and
        source sheet for the selected period.
      </p>
    </main>

    <Modal
      v-if="showPreview"
      :title="selectedProgramName + ' — ' + selectedPeriodLabel"
      @close="showPreview = false"
    >
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-black/50 border-b border-black/10">
            <th class="pb-2">Scope</th>
            <th class="pb-2">Metric</th>
            <th class="pb-2">Actual</th>
            <th class="pb-2">Target</th>
            <th class="pb-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in previewEntries" :key="entry.scope">
            <tr
              v-for="m in entry.metrics"
              :key="entry.scope + m.key"
              class="border-b border-black/5"
            >
              <td class="py-1.5 font-medium">{{ entry.scope }}</td>
              <td class="py-1.5">{{ m.label }}</td>
              <td class="py-1.5">{{ formatMetricValue(m.unit, m.actual) }}</td>
              <td class="py-1.5">
                {{
                  m.target !== null
                    ? formatMetricValue(m.unit, m.target)
                    : "TBD"
                }}
              </td>
              <td class="py-1.5">
                {{
                  m.target !== null
                    ? formatMetricValue(
                        m.unit,
                        balance(m.target, m.actual) ?? 0,
                      )
                    : "—"
                }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <template #footer>
        <button
          @click="showPreview = false"
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
</template>
