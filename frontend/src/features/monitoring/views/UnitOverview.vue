<script setup lang="ts">
import { computed } from "vue";
import { programs } from "../data/mockMonitoring";
import { hasParser } from "../parsers";
import { currentRole, assignedProgram } from "../role";

// Only programs wired to a real .xlsx parser have monitoring data to show —
// the rest of mockMonitoring.ts is still design scaffolding, and listing it
// here just leads to empty dashboards. As of now that is SPES only; add more
// as each program's parser is built (see parsers/index.ts).
const visiblePrograms = computed(() => {
  const withParser = programs.filter((p) => hasParser(p.id));
  if (currentRole.value === "chief") return withParser;
  return withParser.filter((p) => p.id === assignedProgram.value);
});
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <p class="text-sm tracking-wide text-white/70 uppercase">
        DOLE MIMAROPA — TSSD
      </p>
      <h1 class="font-display text-2xl font-semibold mt-1">
        OO1 Monitoring Hub
      </h1>
      <p class="text-white/80 text-sm mt-1">
        Click a program to view its monitoring periods
      </p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <p v-if="visiblePrograms.length === 0" class="text-sm text-black/60">
        <template v-if="currentRole === 'chief'">
          No program has monitoring data available yet.
        </template>
        <template v-else>
          No program is currently assigned to your account. Contact your Chief
          for assistance.
        </template>
      </p>
      <div v-else class="grid gap-4 sm:grid-cols-2">
        <router-link
          v-for="p in visiblePrograms"
          :key="p.id"
          :to="{ name: 'program-periods', params: { programId: p.id } }"
          class="block bg-white border border-black/10 rounded-lg p-5 hover:border-dole-blue hover:shadow-md transition"
        >
          <div class="flex items-center justify-between">
            <h2 class="font-display text-lg font-semibold text-dole-blue">
              {{ p.name }}
            </h2>
            <span
              class="text-xs uppercase tracking-wide bg-dole-gold/20 text-dole-blue-dark px-2 py-1 rounded"
            >
              {{ p.granularity }}
            </span>
          </div>
          <p class="text-sm text-black/70 mt-1">{{ p.fullName }}</p>
          <p class="text-sm text-black/60 mt-2">{{ p.description }}</p>
          <p class="text-xs text-dole-blue mt-3">View monitoring periods →</p>
        </router-link>
      </div>
    </main>
  </div>
</template>
