<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from "vue";

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const dialogRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function getFocusableElements(): HTMLElement[] {
  if (!dialogRef.value) return [];
  const selector =
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(selector),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
    return;
  }
  if (e.key !== "Tab") return;

  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  document.addEventListener("keydown", handleKeydown);
  await nextTick();
  const focusable = getFocusableElements();
  (focusable[0] ?? dialogRef.value)?.focus();
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
  previouslyFocused?.focus();
});
</script>

<template>
  <div
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    @click.self="emit('close')"
  >
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      tabindex="-1"
      class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col outline-none"
    >
      <div
        class="flex justify-between items-center px-6 py-4 border-b border-black/10"
      >
        <h2
          id="modal-heading"
          class="font-display text-lg font-semibold text-dole-blue"
        >
          {{ title }}
        </h2>
        <button
          @click="emit('close')"
          class="text-black/60 hover:text-black/70 text-xl leading-none"
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
