<script setup lang="ts">
import { ref, computed, onMounted, provide } from "vue";
import { getProgram } from "../data/mockMonitoring";
import {
  getFolders,
  createFolder,
  renameFolder,
  retireFolder,
  canManageFolders,
  type FolderRecord,
} from "../data/folderStore";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import FolderTreeNode from "../components/FolderTreeNode.vue";

const props = defineProps<{ programId: string }>();
const program = computed(() => getProgram(props.programId));

const crumbs = computed<Crumb[]>(() => [
  { label: "Monitoring", to: { name: "unit-overview" } },
  {
    label: program.value?.name ?? "",
    to: { name: "program-periods", params: { programId: props.programId } },
  },
  { label: "Folders" },
]);

const { confirmAction } = useConfirm();
const { promptAction } = usePrompt();
const { showToast } = useToast();

const folders = ref<FolderRecord[]>([]);
const loading = ref(true);
const loadError = ref("");

const canManage = computed(() => canManageFolders(props.programId));

async function loadFolders() {
  loading.value = true;
  loadError.value = "";
  try {
    folders.value = await getFolders(props.programId);
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : "Could not load folders.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadFolders);

const childrenMap = computed(() => {
  const map = new Map<number | null, FolderRecord[]>();
  for (const f of folders.value) {
    const key = f.parent_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
});

const rootFolders = computed(() => childrenMap.value.get(null) ?? []);

async function handleCreateChild(parentId: number | null) {
  const name = await promptAction({
    title: parentId ? "New Subfolder" : "New Folder",
    placeholder: "e.g. 2026",
    confirmLabel: "Create",
  });
  if (!name) return;
  try {
    await createFolder(props.programId, name, parentId);
    showToast("Folder created.", "success");
    await loadFolders();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not create folder.",
      "error",
    );
  }
}

async function handleRename(folder: FolderRecord) {
  const name = await promptAction({
    title: "Rename Folder",
    defaultValue: folder.name,
    confirmLabel: "Rename",
  });
  if (!name || name === folder.name) return;
  try {
    await renameFolder(props.programId, folder.id, name);
    showToast("Folder renamed.", "success");
    await loadFolders();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not rename folder.",
      "error",
    );
  }
}

async function handleRetire(folder: FolderRecord) {
  const hasChildren = (childrenMap.value.get(folder.id) ?? []).length > 0;
  const ok = await confirmAction({
    title: "Retire Folder",
    message: hasChildren
      ? `"${folder.name}" contains subfolders. Retiring it will hide it (and its subfolders) from the tree.`
      : `Retire "${folder.name}"? It will be hidden from the tree.`,
    confirmLabel: "Retire",
    danger: true,
  });
  if (!ok) return;
  try {
    await retireFolder(props.programId, folder.id);
    showToast("Folder retired.", "success");
    await loadFolders();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not retire folder.",
      "error",
    );
  }
}

provide("folderActions", {
  childrenMap,
  canManage,
  createChild: handleCreateChild,
  rename: handleRename,
  retire: handleRetire,
});
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.fullName }} — Folders
      </h1>
      <p class="text-white/80 text-sm mt-1">
        Organize uploaded reports into folders.
        {{
          canManage
            ? "You can create, rename, and retire folders here."
            : "View only — you can manage folders for your own assigned program."
        }}
      </p>
    </header>

    <main class="max-w-3xl mx-auto px-8 py-10">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-lg font-semibold text-dole-blue">
          Folder Tree
        </h2>
        <button
          v-if="canManage"
          @click="handleCreateChild(null)"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          + New Folder
        </button>
      </div>

      <div class="bg-white border border-black/10 rounded-lg p-4">
        <p v-if="loading" class="text-sm text-black/50">Loading...</p>
        <p v-else-if="loadError" class="text-sm text-red-600">
          {{ loadError }}
        </p>
        <p v-else-if="rootFolders.length === 0" class="text-sm text-black/50">
          No folders yet.
          <span v-if="canManage"
            >Use "+ New Folder" to create the first one.</span
          >
        </p>
        <ul v-else class="space-y-1">
          <FolderTreeNode
            v-for="folder in rootFolders"
            :key="folder.id"
            :folder="folder"
            :depth="0"
          />
        </ul>
      </div>
    </main>
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
