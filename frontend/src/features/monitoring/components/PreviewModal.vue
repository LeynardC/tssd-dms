<script setup lang="ts">
import { computed } from "vue";
import Modal from "../../../components/Modal.vue";
import { getPreviewUrl, getDownloadUrl } from "../data/fileStore";
import type { FileRecord } from "../data/fileStore";

const props = defineProps<{ file: FileRecord }>();
const emit = defineEmits<{ close: [] }>();

const previewUrl = computed(() => getPreviewUrl(props.file.id));
const isImage = computed(() => props.file.mime_type.startsWith("image/"));
const isPdf = computed(() => props.file.mime_type === "application/pdf");
</script>

<template>
  <Modal :title="file.original_name" @close="emit('close')">
    <div class="flex justify-center bg-black/5 rounded p-2 min-h-[60vh]">
      <img
        v-if="isImage"
        :src="previewUrl"
        :alt="file.original_name"
        class="max-w-full max-h-[70vh] object-contain rounded"
      />
      <iframe
        v-else-if="isPdf"
        :src="previewUrl"
        class="w-full h-[70vh] rounded"
        title="PDF preview"
      />
    </div>
    <template #footer>
      <a
        :href="getDownloadUrl(file.id)"
        target="_blank"
        class="text-sm text-dole-blue hover:underline px-4 py-2"
      >
        Download instead
      </a>
      <button
        @click="emit('close')"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
      >
        Close
      </button>
    </template>
  </Modal>
</template>