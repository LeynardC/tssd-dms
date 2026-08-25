<script setup lang="ts">
import TwoFactorSettings from "../features/auth/views/TwoFactorSettings.vue";
import PasskeySettings from "../features/auth/views/PasskeySettings.vue";
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Settings</h1>
      <p class="text-white/80 text-sm mt-1">Manage your account security.</p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10 space-y-6">
      <TwoFactorSettings />
      <PasskeySettings />
    </main>
  </div>
</template>
