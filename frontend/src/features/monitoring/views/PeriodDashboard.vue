<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram, balance, type Metric } from "../data/mockMonitoring";
import { useProgramFiles } from "../composables/useProgramFiles";
import { useVisibilityRefresh } from "../../../composables/useVisibilityRefresh";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import { formatCurrency } from "../../../utils/format";
import {
  AlertTriangle,
  DollarSign,
  Handshake,
  FileText,
  CheckCircle,
  Banknote,
  Clock,
  Pin,
} from "@lucide/vue";

const props = defineProps<{
  programId: string;
  periodId: string;
  scope: string;
}>();

const { periods, loading, error, refresh } = useProgramFiles(
  computed(() => props.programId),
);

// Re-pull this program's monitoring data when the user tabs back, so a
// dashboard left open reflects a colleague's newer upload.
useVisibilityRefresh(() => refresh({ background: true }));

const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  {
    label: props.periodId,
    to: {
      name: "period-scopes",
      params: { programId: props.programId, periodId: props.periodId },
    },
  },
  { label: props.scope },
]);

const program = computed(() => getProgram(props.programId));

function matchesPeriodId(
  p: { year: number; quarter?: string },
  id: string,
): boolean {
  const built = p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
  return built === id;
}

const matchingEntries = computed(() =>
  periods.value.filter(
    ({ period }) =>
      matchesPeriodId(period, props.periodId) && period.scope === props.scope,
  ),
);

const uploadRecord = computed(() => matchingEntries.value[0]?.file ?? null);

const entries = computed(() =>
  matchingEntries.value.map(({ period }) => period),
);

const hasData = computed(() => entries.value.length > 0);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const showQuarterly = ref(false);

const quarterlyForScope = computed(() => {
  return uploadRecord.value?.data.quarterly?.[props.scope] ?? null;
});

const lguRatesForScope = computed(() => {
  return uploadRecord.value?.data.lguRates?.[props.scope] ?? [];
});

const lguRateSummary = computed(() => {
  const rates = lguRatesForScope.value;
  if (!rates.length) return null;
  const values = rates.map((r) => r.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangeStr =
    min === max
      ? formatCurrency(min)
      : formatCurrency(min) + "–" + formatCurrency(max);
  return rates.length + " municipalities, " + rangeStr;
});

const showLguRates = ref(false);

function quarterTrend(
  current: number,
  previous: number | null,
): "up" | "down" | "flat" | null {
  if (previous === null) return null;
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

const quarterlyWithTrend = computed(() => {
  const data = quarterlyForScope.value;
  if (!data) return [];

  const beneficiariesTarget =
    entries.value[0]?.metrics.find((m) => m.key === "paid")?.target ?? null;
  const fundTarget =
    entries.value[0]?.metrics.find((m) => m.key === "fund")?.target ?? null;

  let cumulativeBenef = 0;
  let cumulativeFund = 0;

  return data.map((q, i) => {
    cumulativeBenef += q.beneficiaries;
    cumulativeFund += q.fund;

    return {
      ...q,
      beneficiariesTrend: quarterTrend(
        q.beneficiaries,
        i > 0 ? data[i - 1].beneficiaries : null,
      ),
      fundTrend: quarterTrend(q.fund, i > 0 ? data[i - 1].fund : null),
      cumulativeBenef,
      cumulativeFund,
      cumulativeBenefPct: beneficiariesTarget
        ? Math.min((cumulativeBenef / beneficiariesTarget) * 100, 100)
        : null,
      cumulativeFundPct: fundTarget
        ? Math.min((cumulativeFund / fundTarget) * 100, 100)
        : null,
    };
  });
});

interface NoteChip {
  icon: typeof AlertTriangle;
  label: string;
  text: string;
}

function categorizeNote(text: string): NoteChip {
  const t = text.toLowerCase();
  if (t.includes("significantly exceeds target"))
    return { icon: AlertTriangle, label: "Data Quality", text };
  if (t.includes("additional fund needed"))
    return { icon: DollarSign, label: "Fund Needed", text };
  if (t.includes("100% counterpart"))
    return { icon: Handshake, label: "Counterpart", text };
  if (t.includes("documents/insurance"))
    return { icon: FileText, label: "Documents", text };
  if (t.includes("payment processing"))
    return { icon: CheckCircle, label: "Processing", text };
  if (t.includes("cost-share split"))
    return { icon: Banknote, label: "Cost Share", text };
  if (t.includes("avg. processing time"))
    return { icon: Clock, label: "Speed", text };
  return { icon: Pin, label: "Note", text };
}

const openChipIndices = ref<Set<number>>(new Set());

function toggleChip(i: number) {
  const next = new Set(openChipIndices.value);
  next.has(i) ? next.delete(i) : next.add(i);
  openChipIndices.value = next;
}

function expandAllChips(entry: { extraNotes?: string[] }) {
  if (!entry.extraNotes) return;
  openChipIndices.value = new Set(entry.extraNotes.map((_, i) => i));
}

function collapseAllChips() {
  openChipIndices.value = new Set();
}
const openSourceTooltip = ref<string | null>(null);

function toggleSourceTooltip(id: string) {
  if (openSourceTooltip.value === id) {
    closeSourceTooltip();
    return;
  }
  openSourceTooltip.value = id;
  // Close on any click outside the tooltip. Registered fresh each time it
  // opens, removed the moment it closes — same pattern as the kebab menu
  // in FileExplorer.vue (showMenu/closeMenu).
  setTimeout(() => document.addEventListener("click", closeSourceTooltip), 0);
}

function closeSourceTooltip() {
  openSourceTooltip.value = null;
  document.removeEventListener("click", closeSourceTooltip);
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

function paidCount(entry: { metrics: Metric[] }): string | null {
  const paid = entry.metrics.find((m) => m.key === "paid");
  return paid ? paid.actual.toLocaleString() : null;
}

function fundActual(entry: { metrics: Metric[] }): number {
  const fund = entry.metrics.find((m) => m.key === "fund");
  return fund ? fund.actual : 0;
}

function paidBalanceText(entry: { metrics: Metric[] }): string | null {
  const placed = entry.metrics.find((m) => m.key === "placed");
  const paid = entry.metrics.find((m) => m.key === "paid");
  const fund = entry.metrics.find((m) => m.key === "fund");
  if (!placed || !paid || !fund) return null;

  const unpaidStudents = Math.max(placed.actual - paid.actual, 0);
  const fundBalance = balance(fund.target, fund.actual);

  const studentsStr = unpaidStudents.toLocaleString() + " students";
  const fundStr = fundBalance !== null ? formatCurrency(fundBalance) : "TBD";
  return studentsStr + " • " + fundStr;
}

function pledgeFlowData(entry: { metrics: Metric[] }): {
  pledged: number;
  supplemental: number;
  totalPledged: number;
  placed: number;
  gap: number;
  exceedsPledge: boolean;
} | null {
  const pledged = entry.metrics.find((m) => m.key === "pledged");
  const supplemental = entry.metrics.find((m) => m.key === "supplemental");
  const placed = entry.metrics.find((m) => m.key === "placed");
  if (!pledged || !supplemental || !placed) return null;

  const totalPledged = pledged.actual + supplemental.actual;
  const gap = placed.actual - totalPledged;
  return {
    pledged: pledged.actual,
    supplemental: supplemental.actual,
    totalPledged,
    placed: placed.actual,
    gap: Math.abs(gap),
    exceedsPledge: gap > 0,
  };
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
        {{ program.fullName }} — Dashboard
      </h1>
      <p v-if="hasData && uploadRecord" class="text-white/70 text-xs mt-2">
        Source: {{ uploadRecord.fileName }} • Uploaded
        {{ formatDate(uploadRecord.uploadedAt) }}
      </p>
      <p v-else-if="!loading" class="text-white/70 text-xs mt-2 italic">
        No file uploaded yet for this program.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <div v-if="loading" class="animate-pulse">
        <div class="flex justify-end mb-4">
          <div class="h-8 w-20 bg-black/10 rounded"></div>
        </div>
        <div class="bg-white border border-black/10 rounded-lg p-5 mb-4">
          <div class="flex justify-between items-baseline mb-3">
            <div class="h-5 w-32 bg-black/10 rounded"></div>
            <div class="h-4 w-20 bg-black/10 rounded"></div>
          </div>
          <div class="grid grid-cols-2 gap-x-6 gap-y-4">
            <div v-for="i in 4" :key="i">
              <div class="h-3 w-20 bg-black/10 rounded mb-1.5"></div>
              <div class="flex justify-between mb-1">
                <div class="h-4 w-16 bg-black/10 rounded"></div>
                <div class="h-3 w-20 bg-black/10 rounded"></div>
              </div>
              <div class="w-full bg-black/5 rounded-full h-1.5"></div>
            </div>
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
        v-else-if="!hasData"
        class="bg-white border border-black/10 border-dashed rounded-lg p-8 text-center"
      >
        <p class="text-black/50 text-sm">
          No data found for this province/period.
        </p>
      </div>

      <template v-else>
        <div class="flex justify-end mb-4 print:hidden">
          <button
            @click="handlePrint"
            class="text-sm border border-dole-blue text-dole-blue px-3 py-1.5 rounded hover:bg-dole-blue hover:text-white transition"
          >
            Print
          </button>
        </div>

        <div
          v-for="entry in entries"
          :key="entry.scope"
          class="bg-white border border-black/10 rounded-lg p-5 mb-4"
        >
          <div class="flex justify-between items-baseline mb-3">
            <h2 class="font-display text-lg font-semibold text-dole-blue">
              {{ entry.scope }}
            </h2>
            <span class="text-sm text-black/50">{{ entry.label }}</span>
          </div>

          <!--
            Summary boxes: additive only. Every individual metric card below
            still renders in full (target, balance, progress bar) — these two
            boxes just add an at-a-glance reading on top, per Leynard's
            confirmation that the original per-metric data must stay visible.
          -->
          <div
            v-if="pledgeFlowData(entry)"
            class="bg-paper border border-black/10 rounded-lg px-4 py-3 mb-4"
          >
            <p class="text-xs font-medium text-black/60 mb-2">
              Pledge → Placement Flow
            </p>
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span class="font-semibold text-dole-blue">{{
                pledgeFlowData(entry)!.pledged.toLocaleString()
              }}</span>
              <span class="text-black/50">pledged</span>
              <span class="text-black/40">+</span>
              <span class="font-semibold text-dole-blue">{{
                pledgeFlowData(entry)!.supplemental.toLocaleString()
              }}</span>
              <span class="text-black/50">supplemental</span>
              <span class="text-black/40">=</span>
              <span class="font-semibold text-dole-blue">{{
                pledgeFlowData(entry)!.totalPledged.toLocaleString()
              }}</span>
              <span class="text-black/50">total pledged</span>
            </div>
            <div
              class="flex items-baseline gap-2 text-sm mt-2 pt-2 border-t border-black/5"
            >
              <span class="font-semibold text-dole-blue">{{
                pledgeFlowData(entry)!.placed.toLocaleString()
              }}</span>
              <span class="text-black/50">actually placed</span>
              <span
                v-if="pledgeFlowData(entry)!.gap > 0"
                :class="
                  pledgeFlowData(entry)!.exceedsPledge
                    ? 'text-dole-red'
                    : 'text-black/60'
                "
                class="text-xs font-medium"
              >
                ({{ pledgeFlowData(entry)!.exceedsPledge ? "+" : "−"
                }}{{ pledgeFlowData(entry)!.gap.toLocaleString() }}
                {{
                  pledgeFlowData(entry)!.exceedsPledge
                    ? "more than pledged"
                    : "fewer than pledged"
                }})
              </span>
            </div>
            <p
              v-if="pledgeFlowData(entry)!.gap > 0"
              class="text-xs text-black/50 italic mt-2 pt-2 border-t border-black/5"
            >
              Gaps commonly reflect multiple placement batches logged for the
              same LGU/employer across the year — not necessarily a data error.
              Worth a quick check with the source records only if the size of
              the gap looks unusual.
            </p>
          </div>

          <div
            v-if="paidCount(entry)"
            class="bg-dole-blue/5 border border-dole-blue/20 rounded-lg px-4 py-3 mb-4"
          >
            <p class="text-xs font-medium text-black/60 mb-1">
              Beneficiaries Paid & Amount Disbursed
            </p>
            <p class="text-lg font-semibold text-dole-blue">
              {{ paidCount(entry) }} students
              <span class="text-black/40 mx-1">•</span>
              {{ formatCurrency(fundActual(entry)) }} disbursed
            </p>
            <p
              v-if="paidBalanceText(entry)"
              class="text-xs text-black/60 mt-2 pt-2 border-t border-dole-blue/10"
            >
              Remaining unpaid: {{ paidBalanceText(entry) }}
            </p>
          </div>

          <!-- All original individual metric cards — unchanged, all shown -->
          <div class="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
            <div v-for="m in entry.metrics" :key="m.key">
              <div
                class="flex items-center gap-1 text-xs font-medium text-black/70 mb-0.5"
              >
                {{ m.label }}
                <div class="relative inline-flex">
                  <button
                    v-if="m.sourceSheet"
                    type="button"
                    @click="toggleSourceTooltip(entry.scope + m.key)"
                    class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/10 text-black/50 text-xs hover:bg-black/20 transition"
                    :aria-label="'Source: ' + m.sourceSheet"
                  >
                    i
                  </button>
                  <div
                    v-if="openSourceTooltip === entry.scope + m.key"
                    @click.stop
                    class="absolute z-10 top-full left-0 mt-1 bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg"
                  >
                    Source: {{ m.sourceSheet }}
                  </div>
                </div>
              </div>
              <div class="flex justify-between items-baseline text-sm mb-1">
                <span
                  :class="
                    m.isPlaceholder
                      ? 'text-black/60 italic'
                      : 'text-dole-blue font-semibold'
                  "
                >
                  {{ formatValue(m) }}
                </span>
                <span class="text-black/60 text-xs"
                  >/ Target: {{ formatTarget(m) }}</span
                >
              </div>
              <div class="w-full bg-black/5 rounded-full h-1.5">
                <div
                  class="h-1.5 rounded-full"
                  :class="m.isPlaceholder ? 'bg-black/20' : 'bg-dole-blue'"
                  :style="{ width: progressPct(m) + '%' }"
                />
              </div>
              <p v-if="m.target !== null" class="text-xs text-black/60 mt-0.5">
                Balance: {{ formatBalance(m) }}
              </p>
            </div>
          </div>

          <div
            v-if="quarterlyWithTrend.length"
            class="border-t border-black/5 pt-3 mb-3"
          >
            <button
              @click="showQuarterly = !showQuarterly"
              class="text-xs font-medium text-dole-blue flex items-center gap-1"
            >
              {{ showQuarterly ? "▾" : "▸" }} Quarter-over-Quarter breakdown
            </button>
            <table v-if="showQuarterly" class="w-full text-xs mt-3">
              <thead>
                <tr class="text-left text-black/50 border-b border-black/10">
                  <th class="pb-1.5">Quarter</th>
                  <th class="pb-1.5">Beneficiaries</th>
                  <th class="pb-1.5">Cumulative %</th>
                  <th class="pb-1.5">Total Amount</th>
                  <th class="pb-1.5">Cumulative %</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="q in quarterlyWithTrend"
                  :key="q.quarter"
                  class="border-b border-black/5 last:border-0"
                >
                  <td class="py-1.5 font-medium">{{ q.quarter }}</td>
                  <td class="py-1.5">
                    {{ q.beneficiaries.toLocaleString() }}
                    <span
                      v-if="q.beneficiariesTrend === 'up'"
                      class="text-green-600 ml-1"
                      >▲</span
                    >
                    <span
                      v-else-if="q.beneficiariesTrend === 'down'"
                      class="text-dole-red ml-1"
                      >▼</span
                    >
                  </td>
                  <td class="py-1.5 text-black/60">
                    {{
                      q.cumulativeBenefPct !== null
                        ? q.cumulativeBenefPct.toFixed(1) + "%"
                        : "—"
                    }}
                  </td>
                  <td class="py-1.5">
                    {{ formatCurrency(q.fund) }}
                    <span
                      v-if="q.fundTrend === 'up'"
                      class="text-green-600 ml-1"
                      >▲</span
                    >
                    <span
                      v-else-if="q.fundTrend === 'down'"
                      class="text-dole-red ml-1"
                      >▼</span
                    >
                  </td>
                  <td class="py-1.5 text-black/60">
                    {{
                      q.cumulativeFundPct !== null
                        ? q.cumulativeFundPct.toFixed(1) + "%"
                        : "—"
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="showQuarterly" class="text-xs text-black/60 italic mt-2">
              Derived from actual payment dates. Cumulative % is vs. the annual
              target — no quarterly target exists in the source file.
            </p>
          </div>

          <div
            v-if="lguRatesForScope.length"
            class="border-t border-black/5 pt-3 mb-3"
          >
            <button
              @click="showLguRates = !showLguRates"
              class="text-xs font-medium text-dole-blue flex items-center gap-1"
            >
              {{ showLguRates ? "▾" : "▸" }} Municipality-Level Hiring Rates
              <span v-if="lguRateSummary" class="text-black/50 font-normal ml-1"
                >({{ lguRateSummary }})</span
              >
            </button>
            <table v-if="showLguRates" class="w-full text-xs mt-3">
              <thead>
                <tr class="text-left text-black/50 border-b border-black/10">
                  <th class="pb-1.5">LGU / Municipality</th>
                  <th class="pb-1.5">Daily Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="lgu in lguRatesForScope"
                  :key="lgu.lgu"
                  class="border-b border-black/5 last:border-0"
                >
                  <td class="py-1.5 font-medium">{{ lgu.lgu }}</td>
                  <td class="py-1.5">{{ formatCurrency(lgu.rate) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="showLguRates" class="text-xs text-black/60 italic mt-2">
              From the SPES Hiring Rate sheet. Cross-check against province-wide
              averages used elsewhere on this dashboard.
            </p>
          </div>

          <p
            v-if="entry.note"
            class="text-xs text-dole-red/80 italic border-t border-black/5 pt-3 mb-2"
          >
            {{ entry.note }}
          </p>

          <div
            v-if="entry.extraNotes && entry.extraNotes.length"
            class="border-t border-black/5 pt-3"
          >
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <button
                v-for="(n, i) in entry.extraNotes"
                :key="i"
                @click="toggleChip(i)"
                class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition"
                :class="
                  openChipIndices.has(i)
                    ? 'bg-dole-blue text-white border-dole-blue'
                    : 'bg-black/5 text-black/60 border-transparent hover:bg-black/10'
                "
              >
                <component :is="categorizeNote(n).icon" :size="12" />
                {{ categorizeNote(n).label }}
              </button>
              <button
                v-if="entry.extraNotes.length > 1"
                @click="
                  openChipIndices.size === entry.extraNotes.length
                    ? collapseAllChips()
                    : expandAllChips(entry)
                "
                class="text-xs text-dole-blue hover:underline ml-1"
              >
                {{
                  openChipIndices.size === entry.extraNotes.length
                    ? "Collapse all"
                    : "Expand all"
                }}
              </button>
            </div>
            <div class="space-y-2">
              <template v-for="(n, i) in entry.extraNotes" :key="i">
                <div
                  v-if="openChipIndices.has(i)"
                  class="flex items-start gap-1.5 text-xs text-black/70 bg-paper rounded p-3"
                >
                  <component
                    :is="categorizeNote(n).icon"
                    :size="14"
                    class="mt-0.5 shrink-0"
                  />
                  <span>
                    <span class="font-medium"
                      >{{ categorizeNote(n).label }}:</span
                    >
                    {{ n }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
  <div v-else class="p-8 text-black/60">Period not found.</div>
</template>
