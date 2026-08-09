<script setup lang="ts">
import { useToast } from "../composables/useToast";
const { toasts } = useToast();
</script>

<template>
  <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm"
        :class="{
          'bg-dole-blue text-white': t.type === 'info',
          'bg-green-600 text-white': t.type === 'success',
          'bg-dole-red text-white': t.type === 'error',
        }"
      >
        {{ t.text }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
