<script setup lang="ts">
import { programs } from "../data/mockMonitoring";
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
      <div class="grid gap-4 sm:grid-cols-2">
        <router-link
          v-for="p in programs"
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
          <p class="text-xs text-black/40 mt-3">
            {{ p.periods.length }} period(s) on record
          </p>
        </router-link>
      </div>
    </main>
  </div>
</template>
