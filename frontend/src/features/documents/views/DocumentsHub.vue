<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { currentRole, assignedProgram } from "../../monitoring/role";
import {
  ensureCategoriesLoaded,
  activeCategories,
  categoriesLoading,
  categoriesError,
  UNIT_LABELS,
} from "../../categories/data/categoryCache";

const router = useRouter();

if (currentRole.value === "staff") {
  onMounted(() => {
    router.replace({
      name: "file-explorer",
      params: { programId: assignedProgram.value },
    });
  });
}

onMounted(ensureCategoriesLoaded);

const isChief = computed(() => currentRole.value === "chief");

// Sorted by unit then name, so Unit 001's programs group together visually
// even though the grid itself doesn't render separate unit headers (yet).
const sortedPrograms = computed(() =>
  [...activeCategories.value].sort(
    (a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name),
  ),
);
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Documents</h1>
      <p class="text-white/80 text-sm mt-1">
        Browse, upload, and manage files across programs.
      </p>
    </header>

    <main v-if="isChief" class="max-w-5xl mx-auto px-8 py-10">
      <p class="text-sm text-black/60 mb-6">
        Select a program to view its files:
      </p>

      <p v-if="categoriesLoading" class="text-sm text-black/50">
        Loading programs...
      </p>
      <p v-else-if="categoriesError" class="text-sm text-red-600">
        {{ categoriesError }}
      </p>
      <p v-else-if="sortedPrograms.length === 0" class="text-sm text-black/50">
        No active programs yet. Add one under Categories.
      </p>

      <div v-else class="grid gap-4 sm:grid-cols-2">
        <router-link
          v-for="program in sortedPrograms"
          :key="program.code"
          :to="{ name: 'file-explorer', params: { programId: program.code } }"
          class="block bg-white border border-black/10 rounded-lg p-5 hover:border-dole-blue hover:shadow-md transition"
        >
          <p class="font-display text-lg font-semibold text-dole-blue">
            {{ program.name }}
          </p>
          <p class="text-sm text-black/60 mt-1">
            {{ UNIT_LABELS[program.unit] }}
          </p>
        </router-link>
      </div>
    </main>

    <main v-else class="max-w-3xl mx-auto px-8 py-16 text-center">
      <p class="text-black/50 text-sm">Loading your files…</p>
    </main>
  </div>
</template>
