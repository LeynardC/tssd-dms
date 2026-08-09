<script setup lang="ts">
const props = defineProps<{
  position: { top: number; left: number };
  kind: "folder" | "file";
  locked?: boolean;
  previewable?: boolean;
}>();

const emit = defineEmits<{
  preview: [];
  rename: [];
  move: [];
  download: [];
  copy: [];
  info: [];
  toggleLock: [];
  delete: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      @click.stop
      class="fixed bg-white border border-black/10 rounded-lg shadow-lg z-50 py-1 w-48"
      :style="{ top: position.top + 'px', left: position.left + 'px' }"
    >
      <button
        v-if="kind === 'file' && previewable"
        @click="emit('preview')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
      >
        Preview
      </button>
      <button
        v-if="kind === 'file'"
        @click="emit('download')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
      >
        Download
      </button>
      <button
        @click="emit('rename')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
        :disabled="locked"
      >
        Rename
      </button>
      <button
        v-if="kind === 'file'"
        @click="emit('copy')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
      >
        Make a Copy
      </button>
      <button
        @click="emit('move')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
        :disabled="locked"
      >
        Move
      </button>
      <button
        @click="emit('info')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
      >
        {{ kind === "folder" ? "Folder Information" : "File Information" }}
      </button>
      <button
        v-if="kind === 'file'"
        @click="emit('toggleLock')"
        class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
      >
        {{ locked ? "Unlock" : "Lock" }}
      </button>
      <div class="border-t border-black/10 my-1"></div>
      <button
        @click="emit('delete')"
        class="w-full text-left px-3 py-2 text-sm text-dole-red hover:bg-red-50"
        :disabled="locked"
      >
        Delete
      </button>
    </div>
  </Teleport>
</template>
