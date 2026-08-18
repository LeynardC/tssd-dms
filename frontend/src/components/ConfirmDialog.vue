<script setup lang="ts">
import { useConfirm } from "../composables/useConfirm";
import Modal from "./Modal.vue";

const { isOpen, options, handleConfirm, handleCancel } = useConfirm();
</script>

<template>
  <Modal v-if="isOpen" :title="options.title" @close="handleCancel">
    <p class="text-sm text-black/70">{{ options.message }}</p>
    <ul
      v-if="options.items && options.items.length"
      class="text-sm text-black/70 list-disc pl-5 mt-2 space-y-1 max-h-60 overflow-y-auto"
    >
      <li v-for="(item, i) in options.items" :key="i">{{ item }}</li>
    </ul>
    <template #footer>
      <button
        @click="handleCancel"
        class="text-sm text-black/60 px-4 py-2 hover:text-black"
      >
        {{ options.cancelLabel ?? "Cancel" }}
      </button>
      <button
        @click="handleConfirm"
        class="text-sm px-4 py-2 rounded transition text-white"
        :class="
          options.danger
            ? 'bg-dole-red hover:bg-red-700'
            : 'bg-dole-blue hover:bg-dole-blue-dark'
        "
      >
        {{ options.confirmLabel ?? "Confirm" }}
      </button>
    </template>
  </Modal>
</template>
