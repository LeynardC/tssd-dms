<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { getProgram } from "../data/mockMonitoring";
import { useProgramFiles } from "../composables/useProgramFiles";
import { useVisibilityRefresh } from "../../../composables/useVisibilityRefresh";
import MetricComparisonChart from "../components/MetricComparisonChart.vue";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import ParentLink from "../../../components/ParentLink.vue";
import { formatCurrency } from "../../../utils/format";

const props = defineProps<{ programId: string; periodId: string }>();
const program = computed(() => getProgram(props.programId));
const showOverview = ref(false);
const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  { label: props.periodId },
]);

const { periods, loading, error, refresh } = useProgramFiles(
  computed(() => props.programId),
);

// Re-pull this program's monitoring data when the user tabs back.
useVisibilityRefresh(() => refresh({ background: true }));

function matchesPeriodId(
  p: { year: number; quarter?: string },
  id: string,
): boolean {
  const built = p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
  return built === id;
}

const matchingEntries = computed(() =>
  periods.value.filter(({ period }) => matchesPeriodId(period, props.periodId)),
);

const AGGREGATE_SCOPE_PATTERN = /region|mimaropa|total/i;

interface MetricGroup {
  key: string;
  label: string;
  unit: "count" | "currency" | "days";
  sourceSheet?: string;
  bars: { label: string; target: number | null; actual: number }[];
}

const periodEntries = computed(() =>
  matchingEntries.value.map(({ period }) => period),
);

const comparisonGroups = computed<MetricGroup[]>(() => {
  const provinceEntries = periodEntries.value.filter(
    (p) => !AGGREGATE_SCOPE_PATTERN.test(p.scope),
  );
  const groups = new Map<string, MetricGroup>();
  provinceEntries.forEach((entry) => {
    entry.metrics.forEach((m) => {
      if (!groups.has(m.key)) {
        groups.set(m.key, {
          key: m.key,
          label: m.label,
          unit: m.unit,
          sourceSheet: m.sourceSheet,
          bars: [],
        });
      }
      groups
        .get(m.key)!
        .bars.push({ label: entry.scope, target: m.target, actual: m.actual });
    });
  });
  return [...groups.values()];
});

interface LguRateSummary {
  province: string;
  count: number;
  min: number;
  max: number;
}

const showRatesOverview = ref(false);

const lguRatesOverview = computed<LguRateSummary[]>(() => {
  const summaries: LguRateSummary[] = [];
  for (const { period, file } of matchingEntries.value) {
    if (AGGREGATE_SCOPE_PATTERN.test(period.scope)) continue;
    const entries = file.data.lguRates?.[period.scope];
    if (entries && entries.length) {
      const values = entries.map((e) => e.rate);
      summaries.push({
        province: period.scope,
        count: entries.length,
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }
  }
  return summaries;
});

const scopes = computed(() => periodEntries.value.map((p) => p.scope));

// --- Monthly disbursement matrix: all provinces + RO + total, one row per
// month. Pure pivot of each scope's periodicBreakdown — no parser change. ---
const MONTHLY_COL_ORDER = [
  "Oriental Mindoro",
  "Occidental Mindoro",
  "Marinduque",
  "Romblon",
  "Palawan",
  "Regional Office",
];
const showMonthly = ref(false);
const monthlyMode = ref<"amount" | "interns">("amount");

const monthlyMatrix = computed(() => {
  const perScope = new Map<
    string,
    Map<string, { label: string; amount: number; interns: number }>
  >();
  let regionData:
    | { bucket: string; label: string; primary: number; secondary: number }[]
    | null = null;
  let title = "Month-by-month disbursement";
  let primaryLabel = "Interns on payroll";
  let secondaryLabel = "Amount disbursed";
  let caption =
    'Each payroll line is placed in the month of its employment period (Monitoring sheet); lines with no period or processing date are grouped as "Undated". "Amount disbursed" is column I (SALARY); the Total column is the region-wide sum, and column / row totals reconcile to each province\'s dashboard figure.';

  for (const { period, file } of matchingEntries.value) {
    const pb = file.data.periodicBreakdown?.[period.scope];
    const labels = file.data.breakdownLabels;
    if (labels?.periodic) title = labels.periodic;
    if (labels?.periodicPrimary) primaryLabel = labels.periodicPrimary;
    if (labels?.periodicSecondary) secondaryLabel = labels.periodicSecondary;
    if (labels?.periodicMatrixCaption) caption = labels.periodicMatrixCaption;
    if (!pb) continue;
    if (/^region$/i.test(period.scope.trim())) {
      regionData = pb;
      continue;
    }
    const m = new Map<
      string,
      { label: string; amount: number; interns: number }
    >();
    for (const b of pb)
      m.set(b.bucket, {
        label: b.label,
        amount: b.secondary,
        interns: b.primary,
      });
    perScope.set(period.scope, m);
  }
  if (perScope.size === 0) return null;

  const cols = MONTHLY_COL_ORDER.filter((s) => perScope.has(s));
  for (const s of perScope.keys()) if (!cols.includes(s)) cols.push(s);

  const bucketLabels = new Map<string, string>();
  for (const m of perScope.values())
    for (const [k, v] of m) bucketLabels.set(k, v.label);
  if (regionData)
    for (const b of regionData) bucketLabels.set(b.bucket, b.label);
  const buckets = [...bucketLabels.keys()].sort();

  const pick = (rec?: { amount: number; interns: number }) =>
    !rec ? 0 : monthlyMode.value === "amount" ? rec.amount : rec.interns;

  const rows = buckets.map((bk) => {
    const cells = cols.map((s) => pick(perScope.get(s)?.get(bk)));
    const rb = regionData?.find((b) => b.bucket === bk);
    const total = rb
      ? monthlyMode.value === "amount"
        ? rb.secondary
        : rb.primary
      : cells.reduce((a, b) => a + b, 0);
    return { label: bucketLabels.get(bk) ?? bk, cells, total };
  });

  const colTotals = cols.map((_, i) =>
    rows.reduce((s, r) => s + r.cells[i], 0),
  );
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return { title, cols, rows, colTotals, grand, primaryLabel, secondaryLabel, caption };
});

function fmtCell(v: number): string {
  if (v === 0) return "–";
  return monthlyMode.value === "amount"
    ? formatCurrency(v)
    : v.toLocaleString();
}

// --- Data method + cross-sheet reconciliation, straight from the parser ---
const showMethod = ref(false);
const methodNotes = computed<string[]>(() => {
  for (const { file } of matchingEntries.value)
    if (file.data.methodNotes?.length) return file.data.methodNotes;
  return [];
});
const reconciliation = computed(() => {
  for (const { file } of matchingEntries.value)
    if (file.data.reconciliation?.length) return file.data.reconciliation;
  return [];
});
const sourceFileName = computed(
  () => matchingEntries.value[0]?.file.fileName ?? "",
);

// Errors first, then warnings, then info — even if the stored blob predates
// the parser sorting them.
const SEV_RANK: Record<string, number> = { error: 0, warn: 1, info: 2 };
const sortedReconciliation = computed(() =>
  [...reconciliation.value].sort(
    (a, b) => (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3),
  ),
);
const reviewCount = computed(
  () => reconciliation.value.filter((f) => f.severity !== "info").length,
);

// Each finding collapses to its one-line title; click to see where/how to fix.
const openFindings = ref<Set<number>>(new Set());
function toggleOpenFinding(i: number) {
  const next = new Set(openFindings.value);
  next.has(i) ? next.delete(i) : next.add(i);
  openFindings.value = next;
}

// Cell list inside an open finding: show PAGE_SIZE at a time. 6–PAGINATE_ABOVE
// cells get a simple "Show all / fewer" toggle; more than that get pager
// controls so the card never runs away.
const PAGE_SIZE = 5;
const PAGINATE_ABOVE = 10;
const expandedFindings = ref<Set<number>>(new Set()); // "show all" for the 6–10 case
const findingPage = ref<Map<number, number>>(new Map()); // finding index -> 0-based page
function toggleFinding(i: number) {
  const next = new Set(expandedFindings.value);
  next.has(i) ? next.delete(i) : next.add(i);
  expandedFindings.value = next;
}
function setFindingPage(i: number, page: number) {
  const next = new Map(findingPage.value);
  next.set(i, page);
  findingPage.value = next;
}
function visibleCells<T>(cells: T[], i: number): T[] {
  if (cells.length <= PAGE_SIZE) return cells;
  if (cells.length <= PAGINATE_ABOVE)
    return expandedFindings.value.has(i) ? cells : cells.slice(0, PAGE_SIZE);
  const last = Math.ceil(cells.length / PAGE_SIZE) - 1;
  const page = Math.min(Math.max(findingPage.value.get(i) ?? 0, 0), last);
  return cells.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}
function pageCount(n: number): number {
  return Math.ceil(n / PAGE_SIZE);
}
// Reset paging/expansion when the underlying findings change (e.g. re-upload).
watch(
  () => reconciliation.value,
  () => {
    findingPage.value = new Map();
    expandedFindings.value = new Set();
    openFindings.value = new Set();
  },
);

function severityCard(s: string): string {
  return (
    {
      error: "border-dole-red/30 border-l-dole-red bg-dole-red/5",
      warn: "border-dole-gold/50 border-l-dole-gold bg-dole-gold/10",
      info: "border-black/10 border-l-black/20 bg-black/[0.015]",
    }[s] ?? "border-black/10 border-l-black/20"
  );
}
function severityIcon(s: string): string {
  return s === "error" ? "⚠" : s === "warn" ? "▲" : "ℹ";
}
function severityIconClass(s: string): string {
  return (
    { error: "text-dole-red", warn: "text-[#8a6a00]", info: "text-black/40" }[
      s
    ] ?? "text-black/40"
  );
}
function pesoTag(n: number): string {
  return (n < 0 ? "-" : "") + formatCurrency(Math.abs(n));
}

function handlePrint() {
  window.print();
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <ParentLink :crumbs="crumbs" label="Periods" />
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.fullName }}
      </h1>
      <p class="text-white/80 text-sm mt-1">
        Select a province to view its data for this period
      </p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <div v-if="loading" class="animate-pulse">
        <div class="h-4 w-40 bg-black/10 rounded mb-3"></div>
        <div class="h-5 w-48 bg-black/10 rounded mb-3"></div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="i in 6"
            :key="i"
            class="bg-white border border-black/10 rounded-lg p-4"
          >
            <div class="h-4 w-24 bg-black/10 rounded"></div>
          </div>
        </div>
      </div>

      <div
        v-else-if="error"
        class="bg-dole-red/10 border border-dole-red/30 text-dole-red rounded-lg p-4"
      >
        {{ error }}
      </div>

      <div
        v-else-if="scopes.length === 0"
        class="bg-white border border-black/10 border-dashed rounded-lg p-8 text-center"
      >
        <p class="text-black/50 text-sm">No provinces found for this period.</p>
      </div>

      <template v-else>
        <button
          @click="showOverview = !showOverview"
          class="text-sm font-medium text-dole-blue flex items-center gap-1 mb-3"
        >
          {{ showOverview ? "▾" : "▸" }} Overview — All Provinces
        </button>
        <div v-if="showOverview" class="grid gap-4 sm:grid-cols-2 mb-6">
          <MetricComparisonChart
            v-for="group in comparisonGroups"
            :key="group.key"
            :title="group.label"
            :subtitle="group.sourceSheet"
            :unit="group.unit"
            :bars="group.bars"
          />
        </div>

        <button
          v-if="lguRatesOverview.length"
          @click="showRatesOverview = !showRatesOverview"
          class="text-sm font-medium text-dole-blue flex items-center gap-1 mb-3"
        >
          {{ showRatesOverview ? "▾" : "▸" }} Hiring Rates — All Provinces
        </button>
        <div
          v-if="showRatesOverview && lguRatesOverview.length"
          class="bg-white border border-black/10 rounded-lg p-4 mb-6"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-black/50 border-b border-black/10">
                <th class="pb-2">Province</th>
                <th class="pb-2">Municipalities</th>
                <th class="pb-2">Rate Range</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in lguRatesOverview"
                :key="s.province"
                class="border-b border-black/5 last:border-0"
              >
                <td class="py-2 font-medium">{{ s.province }}</td>
                <td class="py-2">{{ s.count }}</td>
                <td class="py-2">
                  {{
                    s.min === s.max
                      ? formatCurrency(s.min)
                      : formatCurrency(s.min) + "–" + formatCurrency(s.max)
                  }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-black/50 italic mt-2">
            Click into a province below to see the full municipality-level
            breakdown.
          </p>
        </div>

        <!-- Monthly disbursement matrix: provinces + RO + total, per month -->
        <template v-if="monthlyMatrix">
          <button
            @click="showMonthly = !showMonthly"
            class="text-sm font-medium text-dole-blue flex items-center gap-1 mb-3"
          >
            {{ showMonthly ? "▾" : "▸" }} {{ monthlyMatrix.title }} — All
            Provinces + RO
          </button>
          <div
            v-if="showMonthly"
            class="bg-white border border-black/10 rounded-lg p-4 mb-6"
          >
            <div class="flex items-center justify-between mb-3 print:hidden">
              <div class="inline-flex rounded border border-black/15 text-xs">
                <button
                  @click="monthlyMode = 'amount'"
                  class="px-2.5 py-1"
                  :class="
                    monthlyMode === 'amount'
                      ? 'bg-dole-blue text-white'
                      : 'text-black/60'
                  "
                >
                  {{ monthlyMatrix.secondaryLabel }}
                </button>
                <button
                  @click="monthlyMode = 'interns'"
                  class="px-2.5 py-1"
                  :class="
                    monthlyMode === 'interns'
                      ? 'bg-dole-blue text-white'
                      : 'text-black/60'
                  "
                >
                  {{ monthlyMatrix.primaryLabel }}
                </button>
              </div>
              <button
                @click="handlePrint"
                class="text-xs border border-dole-blue text-dole-blue px-3 py-1 rounded hover:bg-dole-blue hover:text-white transition"
              >
                Print
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-black/50 border-b border-black/10">
                    <th class="pb-1.5 pr-3">Month</th>
                    <th
                      v-for="c in monthlyMatrix.cols"
                      :key="c"
                      class="pb-1.5 px-3 text-right whitespace-nowrap"
                    >
                      {{ c }}
                    </th>
                    <th
                      class="pb-1.5 pl-3 text-right whitespace-nowrap font-semibold text-black/70"
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in monthlyMatrix.rows"
                    :key="row.label"
                    class="border-b border-black/5"
                  >
                    <td class="py-1.5 pr-3 font-medium whitespace-nowrap">
                      {{ row.label }}
                    </td>
                    <td
                      v-for="(cell, ci) in row.cells"
                      :key="ci"
                      class="py-1.5 px-3 text-right whitespace-nowrap"
                      :class="cell === 0 ? 'text-black/30' : ''"
                    >
                      {{ fmtCell(cell) }}
                    </td>
                    <td
                      class="py-1.5 pl-3 text-right whitespace-nowrap font-semibold"
                    >
                      {{ fmtCell(row.total) }}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-black/15 font-semibold">
                    <td class="py-1.5 pr-3">Total</td>
                    <td
                      v-for="(t, ti) in monthlyMatrix.colTotals"
                      :key="ti"
                      class="py-1.5 px-3 text-right whitespace-nowrap"
                    >
                      {{ fmtCell(t) }}
                    </td>
                    <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                      {{ fmtCell(monthlyMatrix.grand) }}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p class="text-xs text-black/50 italic mt-2">
              {{ monthlyMatrix.caption }}
            </p>
          </div>
        </template>

        <!-- Data method + cross-sheet reconciliation (transparency panel) -->
        <template v-if="methodNotes.length || reconciliation.length">
          <button
            @click="showMethod = !showMethod"
            class="text-sm font-medium text-dole-blue flex items-center gap-1 mb-3"
          >
            {{ showMethod ? "▾" : "▸" }} Where the numbers come from &amp; data
            checks
            <span
              v-if="reconciliation.some((f) => f.severity !== 'info')"
              class="ml-1 text-xs bg-dole-red/10 text-dole-red px-2 py-0.5 rounded-full font-medium"
            >
              {{ reconciliation.filter((f) => f.severity !== "info").length }}
              to review
            </span>
          </button>
          <div
            v-if="showMethod"
            class="bg-white border border-black/10 rounded-lg p-5 mb-6"
          >
            <div class="flex items-start justify-between gap-4">
              <p class="text-xs text-black/50">
                Source file:
                <span class="font-medium">{{ sourceFileName }}</span>
              </p>
              <button
                @click="handlePrint"
                class="text-xs border border-dole-blue text-dole-blue px-3 py-1 rounded hover:bg-dole-blue hover:text-white transition print:hidden shrink-0"
              >
                Print
              </button>
            </div>

            <h3
              class="font-display text-sm font-semibold text-dole-blue mt-4 mb-2"
            >
              Where the numbers come from
            </h3>
            <ul class="space-y-1.5 text-xs text-black/70 list-disc pl-4">
              <li v-for="(n, i) in methodNotes" :key="i">{{ n }}</li>
            </ul>

            <div class="mt-5 flex items-baseline justify-between gap-3">
              <h3 class="font-display text-sm font-semibold text-dole-blue">
                Data issues in the source file
              </h3>
              <span
                v-if="reviewCount"
                class="shrink-0 text-[11px] font-medium bg-dole-red/10 text-dole-red px-2 py-0.5 rounded-full"
              >
                {{ reviewCount }} to fix
              </span>
            </div>
            <p class="text-xs text-black/55 mt-1 mb-3">
              Fix these in
              <span class="font-medium">{{ sourceFileName }}</span> and
              re-upload. The totals on this page already account for every item
              below.
            </p>

            <div class="space-y-2">
              <div
                v-for="(f, i) in sortedReconciliation"
                :key="i"
                class="rounded-lg border border-l-4 overflow-hidden"
                :class="severityCard(f.severity)"
              >
                <button
                  type="button"
                  @click="toggleOpenFinding(i)"
                  class="w-full flex items-start gap-2 px-3 py-2 text-left"
                  :aria-expanded="openFindings.has(i)"
                >
                  <span
                    class="shrink-0 text-sm leading-5"
                    :class="severityIconClass(f.severity)"
                    >{{ severityIcon(f.severity) }}</span
                  >
                  <span
                    class="min-w-0 flex-1 text-xs font-semibold text-black/85"
                  >
                    {{ f.title }}
                  </span>
                  <span
                    v-if="f.cells && f.cells.length && !openFindings.has(i)"
                    class="shrink-0 text-[11px] text-black/40 mt-0.5"
                    >{{ f.cells.length }}
                    {{ f.cells.length === 1 ? "cell" : "cells" }}</span
                  >
                  <span class="shrink-0 text-black/40 text-xs mt-0.5">{{
                    openFindings.has(i) ? "▾" : "▸"
                  }}</span>
                </button>

                <div v-if="openFindings.has(i)">
                  <p
                    v-if="f.detail"
                    class="text-xs text-black/55 px-3 pb-2 leading-snug"
                  >
                    {{ f.detail }}
                  </p>

                  <div
                    v-if="f.sheet || f.column || f.fix"
                    class="px-3 pb-2 space-y-1.5"
                  >
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-if="f.sheet"
                        class="inline-flex items-center gap-1 rounded border border-black/10 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-black/70"
                      >
                        <span aria-hidden="true">▦</span> {{ f.sheet }} sheet
                      </span>
                      <span
                        v-if="f.column"
                        class="inline-flex items-center gap-1 rounded border border-black/10 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-black/70"
                      >
                        <span aria-hidden="true">▤</span> {{ f.column }}
                      </span>
                    </div>
                    <p v-if="f.fix" class="text-xs text-black/75 leading-snug">
                      <span class="font-semibold text-black/85"
                        >How to fix: </span
                      >{{ f.fix }}
                    </p>
                  </div>

                  <div
                    v-if="f.cells && f.cells.length"
                    class="border-t border-black/10 bg-white/60 px-3 py-2"
                  >
                    <ul class="divide-y divide-black/25">
                      <li
                        v-for="(c, ci) in visibleCells(f.cells, i)"
                        :key="ci"
                        class="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-xs"
                      >
                        <span class="font-medium text-black/75">{{
                          c.label
                        }}</span>
                        <span v-if="c.value" class="text-black/50"
                          >— {{ c.value }}</span
                        >
                        <span
                          v-if="c.amount != null"
                          class="ml-auto font-mono text-black/55"
                          >{{ pesoTag(c.amount) }}</span
                        >
                        <span
                          v-if="c.ref"
                          class="w-full flex flex-wrap gap-1 mt-0.5"
                        >
                          <code
                            v-for="r in c.ref.split(', ')"
                            :key="r"
                            class="font-mono text-[11px] bg-dole-blue/10 text-dole-blue-dark rounded px-1.5 py-0.5"
                            >{{ r }}</code
                          >
                        </span>
                      </li>
                    </ul>

                    <!-- 6–10 items: simple show all / fewer -->
                    <button
                      v-if="
                        f.cells.length > PAGE_SIZE &&
                        f.cells.length <= PAGINATE_ABOVE
                      "
                      @click="toggleFinding(i)"
                      class="mt-1.5 text-[11px] font-medium text-dole-blue hover:underline print:hidden"
                    >
                      {{
                        expandedFindings.has(i)
                          ? "Show fewer"
                          : `Show all ${f.cells.length}`
                      }}
                    </button>

                    <!-- more than 10 items: pager -->
                    <div
                      v-else-if="f.cells.length > PAGINATE_ABOVE"
                      class="mt-2 flex items-center gap-2 text-[11px] text-black/55 print:hidden"
                    >
                      <button
                        class="rounded border border-black/15 px-1.5 py-0.5 font-medium enabled:hover:bg-black/5 disabled:opacity-40"
                        :disabled="(findingPage.get(i) ?? 0) === 0"
                        @click="
                          setFindingPage(i, (findingPage.get(i) ?? 0) - 1)
                        "
                      >
                        ‹ Prev
                      </button>
                      <span>
                        {{ (findingPage.get(i) ?? 0) * PAGE_SIZE + 1 }}–{{
                          Math.min(
                            ((findingPage.get(i) ?? 0) + 1) * PAGE_SIZE,
                            f.cells.length,
                          )
                        }}
                        of {{ f.cells.length }}
                      </span>
                      <button
                        class="rounded border border-black/15 px-1.5 py-0.5 font-medium enabled:hover:bg-black/5 disabled:opacity-40"
                        :disabled="
                          (findingPage.get(i) ?? 0) >=
                          pageCount(f.cells.length) - 1
                        "
                        @click="
                          setFindingPage(i, (findingPage.get(i) ?? 0) + 1)
                        "
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p class="text-xs text-black/50 italic mt-3">
              These are issues in the source Excel file, not dashboard errors —
              shown here so nothing is hidden.
            </p>
          </div>
        </template>

        <h2 class="font-display text-lg font-semibold text-dole-blue mb-3">
          Select a Province
        </h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <router-link
            v-for="scope in scopes"
            :key="scope"
            :to="{
              name: 'period-dashboard',
              params: { programId: program.id, periodId, scope },
            }"
            class="block bg-white border border-black/10 rounded-lg p-4 hover:border-dole-blue hover:shadow-md transition"
          >
            <p class="font-semibold text-dole-blue">{{ scope }}</p>
          </router-link>
        </div>
      </template>
    </main>
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
