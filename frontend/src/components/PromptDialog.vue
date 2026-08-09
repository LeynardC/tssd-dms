<script setup lang="ts">
import { usePrompt } from "../composables/usePrompt";
import Modal from "./Modal.vue";

const { isOpen, options, inputValue, handleConfirm, handleCancel } =
  usePrompt();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") handleConfirm();
}
</script>

<template>
  <Modal v-if="isOpen" :title="options.title" @close="handleCancel">
    <p v-if="options.message" class="text-sm text-black/70 mb-3">
      {{ options.message }}
    </p>
    <input
      v-model="inputValue"
      type="text"
      :placeholder="options.placeholder ?? ''"
      class="w-full border border-black/20 rounded p-2 text-sm"
      autofocus
      @keydown="onKeydown"
    />
    <template #footer>
      <button
        @click="handleCancel"
        class="text-sm text-black/60 px-4 py-2 hover:text-black"
      >
        {{ options.cancelLabel ?? "Cancel" }}
      </button>
      <button
        @click="handleConfirm"
        class="text-sm px-4 py-2 rounded bg-dole-blue text-white hover:bg-dole-blue-dark transition"
      >
        {{ options.confirmLabel ?? "Save" }}
      </button>
    </template>
  </Modal>
</template>
