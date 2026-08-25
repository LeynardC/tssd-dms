<script setup lang="ts">
import { computed } from "vue";
import { formatCurrency } from "../../../utils/format";

interface Bar {
  label: string;
  target: number | null;
  actual: number;
}

const props = defineProps<{
  title: string;
  subtitle?: string;
  unit: "count" | "currency" | "days";
  bars: Bar[];
}>();

const maxValue = computed(() => {
  const values = props.bars.flatMap((b) => [b.actual, b.target ?? 0]);
  return Math.max(...values, 1);
});

function pct(value: number): number {
  return Math.min((value / maxValue.value) * 100, 100);
}

function formatVal(v: number): string {
  if (props.unit === "currency") return formatCurrency(v);
  if (props.unit === "days") return v.toFixed(1) + "d";
  return v.toLocaleString();
}
</script>

<template>
  <div class="bg-white border border-black/10 rounded-lg p-5">
    <h3 class="font-display text-base font-semibold text-dole-blue mb-1">
      {{ title }}
    </h3>
    <p v-if="subtitle" class="text-xs text-black/60 mb-2">
      from "{{ subtitle }}"
    </p>

    <div class="flex items-center gap-4 text-xs text-black/50 mb-4">
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-3 rounded-sm bg-dole-blue"></span>
        Actual
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-0.5 h-3 bg-dole-red"></span> Target
      </span>
    </div>

    <div v-for="bar in bars" :key="bar.label" class="mb-3 last:mb-0">
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium">{{ bar.label }}</span>
        <span class="text-black/60">
          {{ formatVal(bar.actual)
          }}<span v-if="bar.target !== null">
            / {{ formatVal(bar.target) }}</span
          >
        </span>
      </div>
      <div class="relative w-full bg-black/5 rounded h-3">
        <div
          class="absolute top-0 left-0 h-3 rounded bg-dole-blue"
          :style="{ width: pct(bar.actual) + '%' }"
        />
        <div
          v-if="bar.target !== null"
          class="absolute top-0 h-3 w-0.5 bg-dole-red"
          :style="{ left: pct(bar.target) + '%' }"
          :title="'Target: ' + formatVal(bar.target)"
        />
      </div>
    </div>
  </div>
</template>
