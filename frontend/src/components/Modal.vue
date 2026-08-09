<script setup lang="ts">
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    @click.self="emit('close')"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
    >
      <div
        class="flex justify-between items-center px-6 py-4 border-b border-black/10"
      >
        <h2 class="font-display text-lg font-semibold text-dole-blue">
          {{ title }}
        </h2>
        <button
          @click="emit('close')"
          class="text-black/40 hover:text-black/70 text-xl leading-none"
        >
          &times;
        </button>
      </div>
      <div class="px-6 py-4 overflow-y-auto flex-1">
        <slot />
      </div>
      <div class="px-6 py-4 border-t border-black/10 flex justify-end gap-3">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
