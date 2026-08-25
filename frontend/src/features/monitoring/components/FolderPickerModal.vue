<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  getFolders,
  createFolder,
  type FolderRecord,
} from "../data/folderStore";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";
import Modal from "../../../components/Modal.vue";
import { Folder } from "@lucide/vue";

const props = defineProps<{ programId: string }>();
const emit = defineEmits<{
  close: [];
  select: [folderId: number | null];
}>();

const { promptAction } = usePrompt();
const { showToast } = useToast();

const allFolders = ref<FolderRecord[]>([]);
const loading = ref(true);
const currentFolderId = ref<number | null>(null);
const pathTrail = ref<FolderRecord[]>([]);

const childFolders = computed(() =>
  allFolders.value
    .filter((f) => f.parent_id === currentFolderId.value)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

async function load() {
  loading.value = true;
  try {
    allFolders.value = await getFolders(props.programId);
  } catch {
    showToast("Could not load folders.", "error");
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openFolder(folder: FolderRecord) {
  pathTrail.value = [...pathTrail.value, folder];
  currentFolderId.value = folder.id;
}

function goToBreadcrumb(index: number) {
  if (index < 0) {
    pathTrail.value = [];
    currentFolderId.value = null;
    return;
  }
  pathTrail.value = pathTrail.value.slice(0, index + 1);
  currentFolderId.value = pathTrail.value[index].id;
}

async function handleNewFolder() {
  const name = await promptAction({
    title: "New Folder",
    placeholder: "e.g. 2027",
    confirmLabel: "Create",
  });
  if (!name) return;
  try {
    await createFolder(props.programId, name, currentFolderId.value);
    showToast("Folder created.", "success");
    await load();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not create folder.",
      "error",
    );
  }
}

function handleSaveHere() {
  emit("select", currentFolderId.value);
}
</script>

<template>
  <Modal title="Choose a Folder" @close="emit('close')">
    <div class="flex items-center gap-2 text-sm mb-4 flex-wrap">
      <button
        class="text-dole-blue hover:underline"
        :class="{ 'font-semibold': currentFolderId === null }"
        @click="goToBreadcrumb(-1)"
      >
        Root
      </button>
      <template v-for="(f, i) in pathTrail" :key="f.id">
        <span class="text-black/50">/</span>
        <button
          class="text-dole-blue hover:underline"
          :class="{ 'font-semibold': i === pathTrail.length - 1 }"
          @click="goToBreadcrumb(i)"
        >
          {{ f.name }}
        </button>
      </template>
    </div>

    <div
      class="border border-black/10 rounded-lg min-h-[200px] max-h-[320px] overflow-y-auto"
    >
      <p v-if="loading" class="text-sm text-black/50 p-4">Loading…</p>
      <p
        v-else-if="childFolders.length === 0"
        class="text-sm text-black/60 italic p-4"
      >
        No subfolders here.
      </p>
      <button
        v-for="folder in childFolders"
        :key="folder.id"
        @click="openFolder(folder)"
        class="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm hover:bg-black/5 border-b border-black/5 last:border-0"
      >
        <Folder :size="16" class="text-black/60 shrink-0" />
        <span class="truncate">{{ folder.name }}</span>
      </button>
    </div>

    <button
      @click="handleNewFolder"
      class="mt-3 text-sm text-dole-blue hover:underline"
    >
      + New Folder Here
    </button>

    <template #footer>
      <button
        @click="emit('close')"
        class="text-sm text-black/60 px-4 py-2 hover:text-black"
      >
        Cancel
      </button>
      <button
        @click="handleSaveHere"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
      >
        Save Here
        <span v-if="pathTrail.length" class="opacity-80">
          ({{ pathTrail[pathTrail.length - 1].name }})</span
        >
        <span v-else class="opacity-80">(Root)</span>
      </button>
    </template>
  </Modal>
</template>
