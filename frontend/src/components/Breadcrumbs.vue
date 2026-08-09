<script setup lang="ts">
export interface Crumb {
  label: string;
  to?: { name: string; params?: Record<string, string | undefined> };
}
defineProps<{ crumbs: Crumb[] }>();
</script>

<template>
  <nav
    class="flex items-center flex-wrap gap-1 text-xs text-white/70 mb-2"
    aria-label="Breadcrumb"
  >
    <template v-for="(crumb, i) in crumbs" :key="i">
      <router-link
        v-if="crumb.to"
        :to="crumb.to"
        class="hover:text-white hover:underline"
      >
        {{ crumb.label }}
      </router-link>
      <span v-else class="text-white font-medium">{{ crumb.label }}</span>
      <span v-if="i < crumbs.length - 1" class="text-white/40 px-1">›</span>
    </template>
  </nav>
</template>
