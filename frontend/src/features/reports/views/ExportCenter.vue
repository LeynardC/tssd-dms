<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  programs,
  type PeriodEntry,
  type Metric,
} from "../../monitoring/data/mockMonitoring";
import { hasParser } from "../../monitoring/parsers";
import { useProgramFiles } from "../../monitoring/composables/useProgramFiles";
import { exportSheetNames } from "../reportShared";
import type { ReportInput } from "../reportShared";
import { currentUser } from "../../auth/authStore";
import Modal from "../../../components/Modal.vue";
import { useToast } from "../../../composables/useToast";
import { useVisibilityRefresh } from "../../../composables/useVisibilityRefresh";

const { showToast } = useToast();

// Only programs with a real parser can ever have monitoring data to export
// (SPES today) — same rule as the Monitoring Hub and global search.
const exportablePrograms = computed(() =>
  programs.filter((p) => hasParser(p.id)),
);
const selectedProgramId = ref(exportablePrograms.value[0]?.id ?? "");

// Real, API-backed monitoring data — the same source the dashboards use.
const { periods, loading, error, refresh } = useProgramFiles(selectedProgramId);

function periodId(p: { year: number; quarter?: string }): string {
  return p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
}

interface PeriodOption {
  id: string;
  label: string;
}

const availablePeriods = computed<PeriodOption[]>(() => {
  const seen = new Map<string, PeriodOption>();
  periods.value.forEach(({ period }) => {
    const id = periodId(period);
    if (!seen.has(id)) seen.set(id, { id, label: period.label });
  });
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id));
});

const selectedPeriodId = ref("");
watch(selectedProgramId, () => {
  selectedPeriodId.value = "";
});

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

// All province/region rows of the selected period share one source file.
const selectedMatches = computed(() =>
  periods.value.filter(({ period }) =>
    matchesPeriodId(period, selectedPeriodId.value),
  ),
);
const previewEntries = computed<PeriodEntry[]>(() =>
  selectedMatches.value.map(({ period }) => period),
);
const sourceFile = computed(() => selectedMatches.value[0]?.file ?? null);

// --- preview shaping: region headline + per-province breakdown -------------
const AGGREGATE = /region|mimaropa|total/i;
const previewRegion = computed(() =>
  previewEntries.value.find((e) => AGGREGATE.test(e.scope)) ?? null,
);
const previewProvinces = computed(() =>
  previewEntries.value.filter((e) => !AGGREGATE.test(e.scope)),
);

// "No. of Students (Pledge)" -> "Pledge", "No. of Beneficiaries" -> "Beneficiaries"
function shortLabel(label: string): string {
  const s = label
    .replace(/^no\.\s*of\s*(students\s*)?/i, "")
    .replace(/[()]/g, "")
    .trim();
  return s || label;
}
function pctOfTarget(m: Metric | undefined): number | null {
  if (!m || m.target === null || m.target === 0) return null;
  return (m.actual / m.target) * 100;
}
function pctTone(m: Metric | undefined): string {
  const p = pctOfTarget(m);
  if (p === null) return "text-black/40";
  if (p >= 95) return "text-green-700";
  if (p >= 60) return "text-amber-600";
  return "text-dole-red";
}
function barTone(m: Metric | undefined): string {
  const p = pctOfTarget(m);
  if (p === null) return "bg-black/10";
  if (p >= 95) return "bg-green-600";
  if (p >= 60) return "bg-amber-500";
  return "bg-dole-red";
}
function pctLabel(m: Metric | undefined): string {
  const p = pctOfTarget(m);
  return p === null ? "—" : Math.round(p) + "%";
}
function pctWidth(m: Metric | undefined): string {
  const p = pctOfTarget(m);
  return (p === null ? 0 : Math.min(p, 100)) + "%";
}
function fmtValue(m: Metric | undefined): string {
  if (!m) return "—";
  if (m.unit === "currency")
    return "₱" + m.actual.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return m.actual.toLocaleString();
}
function fmtTarget(m: Metric | undefined): string {
  if (!m || m.target === null) return "no target";
  if (m.unit === "currency")
    return "₱" + m.target.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return m.target.toLocaleString();
}

const selectedProgramName = computed(
  () => programs.find((p) => p.id === selectedProgramId.value)?.name ?? "",
);
const selectedPeriodLabel = computed(
  () =>
    availablePeriods.value.find((p) => p.id === selectedPeriodId.value)
      ?.label ?? "",
);

const includedSheets = computed(() =>
  exportSheetNames({
    entries: previewEntries.value,
    quarterly: sourceFile.value?.data.quarterly,
    unutilizedFunds: sourceFile.value?.data.unutilizedFunds,
    lguRates: sourceFile.value?.data.lguRates,
  }),
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

const xlsBuilding = ref(false);

async function downloadExcel() {
  if (xlsBuilding.value) return;
  xlsBuilding.value = true;
  try {
    const { exportPeriodToExcel } = await import("../exportUtils");
    await exportPeriodToExcel(reportInput());
    showPreview.value = false;
    showToast("Excel workbook downloaded.", "success");
  } catch {
    showToast("Could not build the workbook. Please try again.", "error");
  } finally {
    xlsBuilding.value = false;
  }
}

function preparedByLabel(): string {
  const u = currentUser.value;
  if (!u) return "TSSD";
  const title = u.position ?? (u.role === "chief" ? "TSSD Chief" : "TSSD Staff");
  return `${u.name} · ${title}`;
}

// --- PDF report: preview the exact PDF; the viewer's own toolbar downloads/prints it ---
const showReportPreview = ref(false);
const pdfPreviewUrl = ref("");
const pdfBuilding = ref(false);

function reportInput(): ReportInput {
  return {
    programName: selectedProgramName.value,
    programFullName:
      programs.find((p) => p.id === selectedProgramId.value)?.fullName ??
      selectedProgramName.value,
    periodLabel: selectedPeriodLabel.value,
    preparedBy: preparedByLabel(),
    sourceFileName: sourceFile.value?.fileName ?? "—",
    entries: previewEntries.value,
    quarterly: sourceFile.value?.data.quarterly,
    unutilizedFunds: sourceFile.value?.data.unutilizedFunds,
    lguRates: sourceFile.value?.data.lguRates,
  };
}

async function openReportPreview() {
  showPreview.value = false;
  showReportPreview.value = true;
  pdfBuilding.value = true;
  try {
    const { reportPdfPreviewUrl } = await import("../reportPdf");
    pdfPreviewUrl.value = await reportPdfPreviewUrl(reportInput());
  } catch {
    showToast("Could not build the report. Please try again.", "error");
    closeReportPreview();
  } finally {
    pdfBuilding.value = false;
  }
}

function closeReportPreview() {
  showReportPreview.value = false;
  if (pdfPreviewUrl.value) {
    URL.revokeObjectURL(pdfPreviewUrl.value);
    pdfPreviewUrl.value = "";
  }
}

function onReportKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && showReportPreview.value) closeReportPreview();
}
onMounted(() => document.addEventListener("keydown", onReportKeydown));
onUnmounted(() => document.removeEventListener("keydown", onReportKeydown));

// Re-pull the selected program's monitoring data when the user tabs back —
// but not while a preview is open or an export is being built, so the
// figures on screen can't shift mid-review or mid-build.
useVisibilityRefresh(() => refresh({ background: true }), {
  canRun: () =>
    !showPreview.value &&
    !showReportPreview.value &&
    !xlsBuilding.value &&
    !pdfBuilding.value,
});

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
      <div
        v-if="exportablePrograms.length === 0"
        class="bg-white border border-black/10 border-dashed rounded-lg p-8 text-center text-sm text-black/60"
      >
        No program has monitoring data available to export yet.
      </div>

      <div v-else class="bg-white border border-black/10 rounded-lg p-6">
        <div class="mb-4">
          <label for="export-program" class="block text-sm font-medium mb-1"
            >Program</label
          >
          <select
            id="export-program"
            v-model="selectedProgramId"
            class="w-full border border-black/20 rounded p-2 text-sm"
          >
            <option v-for="p in exportablePrograms" :key="p.id" :value="p.id">
              {{ p.name }} — {{ p.fullName }}
            </option>
          </select>
        </div>

        <div class="mb-6">
          <label for="export-period" class="block text-sm font-medium mb-1"
            >Period</label
          >
          <select
            id="export-period"
            v-model="selectedPeriodId"
            :disabled="loading || availablePeriods.length === 0"
            class="w-full border border-black/20 rounded p-2 text-sm disabled:bg-black/5"
          >
            <option value="" disabled>
              {{
                loading
                  ? "Loading periods…"
                  : availablePeriods.length
                    ? "Select a period"
                    : "No monitoring data uploaded yet"
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
          Preview &amp; export
        </button>

        <p v-if="error" class="text-dole-red text-sm mt-3">{{ error }}</p>
      </div>

      <p
        v-if="exportablePrograms.length > 0"
        class="text-xs text-black/60 italic mt-4"
      >
        Two formats: an <b>Excel workbook</b> (Summary, Quarterly, Notes &amp;
        Flags, Unutilized Funds, Hiring Rates) for working with the figures, and
        a formatted <b>PDF report</b> for transmittal. Both cover the selected
        period.
      </p>
    </main>

    <Modal
      v-if="showPreview"
      :title="selectedProgramName + ' — ' + selectedPeriodLabel"
      @close="showPreview = false"
    >
      <div class="flex flex-wrap items-center gap-1.5 mb-4">
        <span class="text-xs text-black/50 mr-1">This export contains:</span>
        <span
          v-for="s in includedSheets"
          :key="s"
          class="text-[11px] font-medium bg-dole-blue/10 text-dole-blue-dark px-2 py-0.5 rounded"
        >
          {{ s }}
        </span>
      </div>

      <!-- Region headline -->
      <div
        v-if="previewRegion"
        class="mb-4 rounded-lg bg-dole-blue text-white px-4 py-3"
      >
        <p
          class="text-[11px] uppercase tracking-wide text-white/60 font-semibold mb-2"
        >
          {{ previewRegion.scope }} — totals
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2.5">
          <div v-for="m in previewRegion.metrics" :key="m.key">
            <p class="text-[11px] text-white/60 leading-tight">
              {{ shortLabel(m.label) }}
            </p>
            <p class="text-base font-semibold tabular-nums leading-tight mt-0.5">
              {{ fmtValue(m) }}
            </p>
            <p class="text-[11px] text-white/70 tabular-nums mt-0.5">
              <template v-if="m.target !== null"
                >of {{ fmtTarget(m) }} ·
                <span class="font-semibold text-white">{{
                  pctLabel(m)
                }}</span></template
              >
              <template v-else>no target set</template>
            </p>
          </div>
        </div>
      </div>

      <!-- Per-province breakdown -->
      <p class="text-xs font-semibold text-black/50 uppercase tracking-wide mb-2">
        By province
      </p>
      <div
        v-for="p in previewProvinces"
        :key="p.scope"
        class="mb-2.5 last:mb-0 rounded-lg border border-black/10 overflow-hidden"
      >
        <div
          class="bg-dole-blue/5 px-3 py-1.5 font-semibold text-dole-blue-dark text-sm"
        >
          {{ p.scope }}
        </div>
        <div class="divide-y divide-black/5">
          <div
            v-for="m in p.metrics"
            :key="m.key"
            class="flex items-center gap-2 px-3 py-1.5 text-sm"
          >
            <span class="flex-1 min-w-0 truncate text-black/70">{{
              shortLabel(m.label)
            }}</span>
            <span class="w-24 text-right font-medium tabular-nums shrink-0">{{
              fmtValue(m)
            }}</span>
            <span
              class="w-24 text-right text-xs text-black/45 tabular-nums shrink-0 hidden sm:inline"
            >
              {{ m.target !== null ? "of " + fmtTarget(m) : "—" }}
            </span>
            <span
              class="w-9 h-1 rounded-full bg-black/10 overflow-hidden shrink-0 hidden sm:block"
            >
              <span
                class="block h-full"
                :class="barTone(m)"
                :style="{ width: pctWidth(m) }"
              ></span>
            </span>
            <span
              class="w-10 text-right text-xs font-semibold tabular-nums shrink-0"
              :class="pctTone(m)"
            >
              {{ pctLabel(m) }}
            </span>
          </div>
        </div>
      </div>

      <p class="text-[11px] text-black/45 mt-3">
        Percentages are actual ÷ target. Full figures, quarterly breakdown and
        notes are in the downloaded files.
      </p>

      <template #footer>
        <button
          @click="showPreview = false"
          class="text-sm text-black/60 px-4 py-2 hover:text-black"
        >
          Cancel
        </button>
        <button
          @click="downloadExcel"
          :disabled="xlsBuilding"
          class="border border-dole-blue text-dole-blue text-sm px-4 py-2 rounded hover:bg-dole-blue/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ xlsBuilding ? "Building…" : "Excel workbook" }}
        </button>
        <button
          @click="openReportPreview"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          PDF report
        </button>
      </template>
    </Modal>

    <!-- The exact PDF, reviewed before it is saved to a folder -->
    <div
      v-if="showReportPreview"
      class="fixed inset-0 z-50 bg-black/60 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Report preview"
    >
      <div
        class="flex items-center justify-between gap-3 bg-white px-4 py-2.5 shadow-md"
      >
        <div class="min-w-0">
          <p class="text-sm font-semibold text-dole-blue truncate">
            {{ selectedProgramName }} · {{ selectedPeriodLabel }} — Report
          </p>
          <p class="text-[11px] text-black/50">
            Use the
            <span class="font-semibold">download</span> button on the viewer
            toolbar below to save this PDF, or
            <span class="font-semibold">print</span> it.
          </p>
        </div>
        <button
          @click="closeReportPreview"
          class="text-sm text-white bg-dole-blue px-4 py-1.5 rounded hover:bg-dole-blue-dark transition shrink-0"
        >
          Close
        </button>
      </div>
      <div class="flex-1 relative bg-neutral-300">
        <div
          v-if="pdfBuilding"
          class="absolute inset-0 flex items-center justify-center text-sm text-black/60"
        >
          Building the report…
        </div>
        <iframe
          v-if="pdfPreviewUrl"
          :src="pdfPreviewUrl"
          title="Monitoring report preview"
          class="absolute inset-0 w-full h-full border-0"
        ></iframe>
      </div>
    </div>
  </div>
</template>
