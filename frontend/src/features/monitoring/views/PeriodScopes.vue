<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram } from "../data/mockMonitoring";
import { useProgramFiles } from "../composables/useProgramFiles";
import MetricComparisonChart from "../components/MetricComparisonChart.vue";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
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

const { periods, loading, error } = useProgramFiles(
  computed(() => props.programId),
);

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
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
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
