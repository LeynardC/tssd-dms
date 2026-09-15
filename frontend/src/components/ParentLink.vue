<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft } from "@lucide/vue";
import type { Crumb } from "./Breadcrumbs.vue";

// A prominent "go up one level" link for drill-down pages. It reads the
// SAME crumbs array the <Breadcrumbs> trail uses and links to the
// second-to-last entry (the last entry is the current page). Explicit route,
// never router.back() — so it behaves the same after a refresh or a
// deep-link, and it always tells you where you'll land.
const props = defineProps<{
  crumbs: Crumb[];
  /** Override the parent crumb's own label when it isn't self-explanatory. */
  label?: string;
}>();

const parent = computed(() => {
  const c = props.crumbs;
  return c.length >= 2 ? c[c.length - 2] : undefined;
});
</script>

<template>
  <router-link
    v-if="parent && parent.to"
    :to="parent.to"
    class="inline-flex items-center gap-1 -ml-1 mb-1.5 text-sm text-white/85 hover:text-white hover:underline"
  >
    <ChevronLeft :size="16" class="shrink-0" />
    {{ label ?? parent.label }}
  </router-link>
</template>
