<script setup lang="ts">
import { ref, computed } from "vue";
import { getProgram } from "../data/mockMonitoring";
import { getPeriodsWithSource } from "../data/uploadStore";
import MetricComparisonChart from "../components/MetricComparisonChart.vue";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const props = defineProps<{ programId: string; periodId: string }>();
const program = computed(() => getProgram(props.programId));
const showOverview = ref(false);
const showReallocation = ref(false);
const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  { label: props.periodId },
]);

const unutilizedFunds = computed(() => {
  const match = getPeriodsWithSource(props.programId).find(({ period }) =>
    matchesPeriodId(period, props.periodId),
  );
  return match?.file.unutilizedFunds ?? [];
});

const AGGREGATE_SCOPE_PATTERN = /region|mimaropa|total/i;

function matchesPeriodId(
  p: { year: number; quarter?: string },
  id: string,
): boolean {
  const built = p.quarter ? `${p.year}-${p.quarter}` : `${p.year}`;
  return built === id;
}

interface MetricGroup {
  key: string;
  label: string;
  unit: "count" | "currency" | "days";
  sourceSheet?: string;
  bars: { label: string; target: number | null; actual: number }[];
}

const periodEntries = computed(() => {
  return getPeriodsWithSource(props.programId)
    .filter(({ period }) => matchesPeriodId(period, props.periodId))
    .map(({ period }) => period);
});

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
      <div
        v-if="scopes.length === 0"
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
          v-if="unutilizedFunds.length"
          @click="showReallocation = !showReallocation"
          class="text-sm font-medium text-dole-blue flex items-center gap-1 mb-3"
        >
          {{ showReallocation ? "▾" : "▸" }} Fund Reallocation
        </button>
        <div
          v-if="showReallocation && unutilizedFunds.length"
          class="bg-white border border-black/10 rounded-lg p-5 mb-6"
        >
          <p class="text-[11px] text-black/40 mb-3">
            from "Takers of unutilized SPES funds" — LGU-level, not mapped to
            province
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-black/50 border-b border-black/10">
                <th class="pb-2">LGU</th>
                <th class="pb-2">Starting Balance</th>
                <th class="pb-2">Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in unutilizedFunds"
                :key="entry.lgu"
                class="border-b border-black/5 last:border-0"
              >
                <td class="py-2">{{ entry.lgu }}</td>
                <td class="py-2">
                  ₱{{
                    (entry.startingBalance ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })
                  }}
                </td>
                <td class="py-2">
                  ₱{{
                    (entry.remainingBalance ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })
                  }}
                </td>
              </tr>
            </tbody>
          </table>
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
</template>
