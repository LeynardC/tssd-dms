<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">{{ title }}</h1>
    </header>
    <main class="max-w-3xl mx-auto px-8 py-16 text-center">
      <p class="text-4xl mb-4">🚧</p>
      <h2 class="font-display text-xl font-semibold text-dole-blue mb-2">
        Coming Soon
      </h2>
      <p class="text-black/60">
        {{ description || "This section is planned but not yet built." }}
      </p>
    </main>
  </div>
</template>
