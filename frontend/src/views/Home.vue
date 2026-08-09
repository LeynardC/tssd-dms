<script setup lang="ts">
import { currentRole } from "../features/monitoring/role";
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <p class="text-sm text-white/70 uppercase tracking-wide">
        DOLE MIMAROPA — TSSD
      </p>
      <h1 class="font-display text-2xl font-semibold mt-1">
        Welcome{{ currentRole === "chief" ? ", Chief" : "" }}
      </h1>
    </header>
    <main class="max-w-4xl mx-auto px-8 py-10">
      <div class="bg-white border border-black/10 rounded-lg p-6">
        <h2 class="font-display text-lg font-semibold text-dole-blue mb-2">
          Get Started
        </h2>
        <p class="text-black/60 text-sm">
          Use the sidebar to navigate to Monitoring for program dashboards, or
          Documents for the document tracking system (coming soon).
        </p>
      </div>
    </main>
  </div>
</template>
