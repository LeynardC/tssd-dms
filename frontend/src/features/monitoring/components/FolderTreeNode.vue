<script setup lang="ts">
import { inject, computed } from "vue";
import type { FolderRecord } from "../data/folderStore";

defineOptions({ name: "FolderTreeNode" }); // needed for Vue to allow this component to reference itself recursively

const props = defineProps<{
  folder: FolderRecord;
  depth: number;
}>();

const folderActions = inject<{
  childrenMap: { value: Map<number | null, FolderRecord[]> };
  canManage: { value: boolean };
  createChild: (parentId: number | null) => void;
  rename: (folder: FolderRecord) => void;
  retire: (folder: FolderRecord) => void;
}>("folderActions");

const children = computed(
  () => folderActions?.childrenMap.value.get(props.folder.id) ?? [],
);
const canManage = computed(() => folderActions?.canManage.value ?? false);
</script>

<template>
  <li>
    <div
      class="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-black/5 group"
      :style="{ paddingLeft: depth * 20 + 8 + 'px' }"
    >
      <span class="text-sm flex items-center gap-2">
        <span class="text-black/40">📁</span>
        {{ folder.name }}
      </span>
      <div
        v-if="canManage"
        class="flex items-center gap-3 text-xs opacity-0 group-hover:opacity-100 transition"
      >
        <button
          @click="folderActions?.createChild(folder.id)"
          class="text-dole-blue hover:underline"
        >
          + Subfolder
        </button>
        <button
          @click="folderActions?.rename(folder)"
          class="text-dole-blue hover:underline"
        >
          Rename
        </button>
        <button
          @click="folderActions?.retire(folder)"
          class="text-dole-red hover:underline"
        >
          Retire
        </button>
      </div>
    </div>
    <ul v-if="children.length" class="space-y-1">
      <FolderTreeNode
        v-for="child in children"
        :key="child.id"
        :folder="child"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>
