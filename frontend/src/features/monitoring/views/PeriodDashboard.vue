<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram, balance, type Metric } from "../data/mockMonitoring";
import { getPeriodsWithSource } from "../data/uploadStore";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import { formatCurrency } from "../../../utils/format";

const props = defineProps<{
  programId: string;
  periodId: string;
  scope: string;
}>();
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

const uploadRecord = computed(() => {
  const match = getPeriodsWithSource(props.programId).find(
    ({ period }) =>
      matchesPeriodId(period, props.periodId) && period.scope === props.scope,
  );
  return match?.file ?? null;
});

function matchesPeriodId(
  p: { year: number; quarter?: string },
  id: string,
): boolean {
  const built = p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
  return built === id;
}

const entries = computed(() => {
  return getPeriodsWithSource(props.programId)
    .filter(
      ({ period }) =>
        matchesPeriodId(period, props.periodId) && period.scope === props.scope,
    )
    .map(({ period }) => period);
});

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
  const match = getPeriodsWithSource(props.programId).find(
    ({ period }) =>
      matchesPeriodId(period, props.periodId) && period.scope === props.scope,
  );
  return match?.file.quarterly?.[props.scope] ?? null;
});

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
  icon: string;
  label: string;
  text: string;
}

function categorizeNote(text: string): NoteChip {
  const t = text.toLowerCase();
  if (t.includes("significantly exceeds target"))
    return { icon: "⚠️", label: "Data Quality", text };
  if (t.includes("additional fund needed"))
    return { icon: "💰", label: "Fund Needed", text };
  if (t.includes("100% counterpart"))
    return { icon: "🤝", label: "Counterpart", text };
  if (t.includes("documents/insurance"))
    return { icon: "📋", label: "Documents", text };
  if (t.includes("payment processing"))
    return { icon: "✅", label: "Processing", text };
  if (t.includes("cost-share split"))
    return { icon: "💵", label: "Cost Share", text };
  if (t.includes("avg. processing time"))
    return { icon: "⏱️", label: "Speed", text };
  return { icon: "📌", label: "Note", text };
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
  openSourceTooltip.value = openSourceTooltip.value === id ? null : id;
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
        {{ program.fullName }} — Dashboard
      </h1>
      <p v-if="hasData && uploadRecord" class="text-white/70 text-xs mt-2">
        Source: {{ uploadRecord.fileName }} • Uploaded
        {{ formatDate(uploadRecord.uploadedAt) }}
      </p>
      <p v-else class="text-white/70 text-xs mt-2 italic">
        No file uploaded yet for this program.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <div
        v-if="!hasData"
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
                    class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/10 text-black/50 text-[9px] hover:bg-black/20 transition"
                    :aria-label="'Source: ' + m.sourceSheet"
                  >
                    i
                  </button>
                  <div
                    v-if="openSourceTooltip === entry.scope + m.key"
                    class="absolute z-10 top-full left-0 mt-1 bg-black text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg"
                  >
                    Source: {{ m.sourceSheet }}
                  </div>
                </div>
              </div>
              <div class="flex justify-between items-baseline text-sm mb-1">
                <span
                  :class="
                    m.isPlaceholder
                      ? 'text-black/40 italic'
                      : 'text-dole-blue font-semibold'
                  "
                >
                  {{ formatValue(m) }}
                </span>
                <span class="text-black/40 text-xs"
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
              <p
                v-if="m.target !== null"
                class="text-[11px] text-black/40 mt-0.5"
              >
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
                    ₱{{
                      q.fund.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })
                    }}
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
            <p
              v-if="showQuarterly"
              class="text-[11px] text-black/40 italic mt-2"
            >
              Derived from actual payment dates. Cumulative % is vs. the annual
              target — no quarterly target exists in the source file.
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
                class="text-xs px-2.5 py-1 rounded-full border transition"
                :class="
                  openChipIndices.has(i)
                    ? 'bg-dole-blue text-white border-dole-blue'
                    : 'bg-black/5 text-black/60 border-transparent hover:bg-black/10'
                "
              >
                {{ categorizeNote(n).icon }} {{ categorizeNote(n).label }}
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
                  class="text-xs text-black/70 bg-paper rounded p-3"
                >
                  {{ categorizeNote(n).icon }}
                  <span class="font-medium"
                    >{{ categorizeNote(n).label }}:</span
                  >
                  {{ n }}
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
