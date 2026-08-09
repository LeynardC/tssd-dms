<script setup lang="ts">
import { computed } from "vue";
import type { FolderRecord } from "../data/folderStore";
import type { FileRecord } from "../data/fileStore";

const props = defineProps<{
  layout: "grid" | "list";
  kind: "folder" | "file";
  folder?: FolderRecord;
  file?: FileRecord;
  canManage: boolean;
}>();

const emit = defineEmits<{
  open: [];
  menu: [event: MouseEvent];
}>();

const name = computed(
  () => props.folder?.name ?? props.file?.original_name ?? "",
);
const ownerName = computed(() => props.file?.uploader?.name ?? "—");
const modifiedAt = computed(() => {
  const iso = props.folder?.updated_at ?? props.file?.updated_at;
  return iso
    ? new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
});
const sizeLabel = computed(() => {
  if (!props.file) return "—";
  const kb = props.file.size_bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
});
const icon = computed(() => (props.kind === "folder" ? "📁" : "📄"));
</script>

<template>
  <!-- List layout: one row -->
  <div
    v-if="layout === 'list'"
    class="grid grid-cols-[1fr_140px_180px_100px_40px] items-center gap-3 px-3 py-2 rounded hover:bg-black/5 group cursor-pointer"
    @click="emit('open')"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span>{{ icon }}</span>
      <span class="text-sm truncate" :class="{ 'text-black/40': file?.locked }">
        {{ name }}
        <span v-if="file?.locked" class="text-xs text-black/40 ml-1"
          >(locked)</span
        >
      </span>
    </div>
    <span class="text-xs text-black/50 truncate">{{ ownerName }}</span>
    <span class="text-xs text-black/50">{{ modifiedAt }}</span>
    <span class="text-xs text-black/50">{{ sizeLabel }}</span>
    <button
      v-if="canManage"
      @click.stop="emit('menu', $event)"
      class="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-black/10 text-black/50 hover:text-black opacity-0 group-hover:opacity-100 transition"
      aria-label="Actions"
    >
      ⋮
    </button>
  </div>

  <!-- Grid layout: a tile -->
  <div
    v-else
    class="relative border border-black/10 rounded-lg p-4 hover:border-dole-blue hover:shadow-sm transition cursor-pointer group"
    @click="emit('open')"
  >
    <button
      v-if="canManage"
      @click.stop="emit('menu', $event)"
      class="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded hover:bg-black/10 text-black/50 hover:text-black opacity-0 group-hover:opacity-100 transition"
      aria-label="Actions"
    >
      ⋮
    </button>
    <div class="text-3xl mb-2">{{ icon }}</div>
    <p
      class="text-sm font-medium truncate"
      :class="{ 'text-black/40': file?.locked }"
    >
      {{ name }}
    </p>
    <p v-if="file" class="text-xs text-black/40 mt-1">{{ sizeLabel }}</p>
  </div>
</template>
