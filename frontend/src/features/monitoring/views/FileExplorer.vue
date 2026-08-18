<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import * as XLSX from "xlsx";
import { hasParser, parseWorkbookForProgram } from "../parsers";
import {
  ensureCategoriesLoaded,
  activeCategories,
} from "../../categories/data/categoryCache";
import {
  getFolders,
  createFolder,
  renameFolder,
  retireFolder,
  canManageFolders,
  type FolderRecord,
} from "../data/folderStore";
import {
  getFiles,
  uploadFileWithProgress,
  renameFile,
  moveFile,
  toggleFileLock,
  deleteFile,
  getDownloadUrl,
  type FileRecord,
  isPreviewable,
} from "../data/fileStore";
import PreviewModal from "../components/PreviewModal.vue";

import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";
import Modal from "../../../components/Modal.vue";
import ExplorerItem from "../components/ExplorerItem.vue";
import ExplorerMenu from "../components/ExplorerMenu.vue";
import { useProgramFiles } from "../composables/useProgramFiles";

const props = defineProps<{
  programId: string;
  folderPath?: string[];
}>();
const router = useRouter();
const program = computed(() =>
  activeCategories.value.find((c) => c.code === props.programId),
);
const { confirmAction } = useConfirm();
const { promptAction } = usePrompt();
const { showToast } = useToast();

const canManage = computed(() => canManageFolders(props.programId));
const layout = ref<"grid" | "list">("list");
const { periods: existingPeriods } = useProgramFiles(props.programId);

// --- Navigation: current folder + breadcrumb trail, derived from the URL ---
const folderIds = computed<number[]>(() =>
  (props.folderPath ?? []).map((id) => Number(id)),
);

const currentFolderId = computed<number | null>(() => {
  const ids = folderIds.value;
  return ids.length === 0 ? null : ids[ids.length - 1];
});

const allFolders = ref<FolderRecord[]>([]);
const files = ref<FileRecord[]>([]);
const loading = ref(true);
const loadError = ref("");

const pathTrail = computed<FolderRecord[]>(() =>
  folderIds.value
    .map((id) => allFolders.value.find((f) => f.id === id))
    .filter((f): f is FolderRecord => !!f),
);

const crumbs = computed<Crumb[]>(
  () =>
    [
      { label: "Documents", to: { name: "documents" } },
      {
        label: program.value?.name ?? "",
        to:
          currentFolderId.value === null
            ? undefined
            : {
                name: "file-explorer",
                params: { programId: props.programId, folderPath: [] },
              },
      },
      ...pathTrail.value.map((f, i) => ({
        label: f.name,
        to:
          i === pathTrail.value.length - 1
            ? undefined
            : {
                name: "file-explorer",
                params: {
                  programId: props.programId,
                  folderPath: folderIds.value.slice(0, i + 1).map(String),
                },
              },
      })),
    ] as Crumb[],
);

const childFolders = computed(() =>
  allFolders.value
    .filter((f) => f.parent_id === currentFolderId.value)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

async function loadAll() {
  loading.value = true;
  loadError.value = "";
  try {
    const [folderResult, fileResult] = await Promise.all([
      getFolders(props.programId),
      getFiles(props.programId, currentFolderId.value),
    ]);
    allFolders.value = folderResult;
    files.value = fileResult;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "Could not load.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
onMounted(ensureCategoriesLoaded);
watch(() => props.folderPath, loadAll);
watch(() => props.folderPath, closeMenu);

function openFolder(folder: FolderRecord) {
  router.push({
    name: "file-explorer",
    params: {
      programId: props.programId,
      folderPath: [...folderIds.value.map(String), String(folder.id)],
    },
  });
}

// --- New folder ---
async function handleNewFolder() {
  const name = await promptAction({
    title: "New Folder",
    placeholder: "e.g. 2026",
    confirmLabel: "Create",
  });
  if (!name) return;
  try {
    await createFolder(props.programId, name, currentFolderId.value);
    showToast("Folder created.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not create folder.",
      "error",
    );
  }
}

// --- Upload ---
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadProgress = ref(0);
function triggerUpload() {
  fileInput.value?.click();
}

function isLikelyXlsx(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 2));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function tryParseXlsx(file: File): Promise<unknown | undefined> {
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
  if (!isXlsx || !hasParser(props.programId)) return undefined;

  try {
    const buffer = await file.arrayBuffer();
    if (!isLikelyXlsx(buffer)) return undefined;
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const result = parseWorkbookForProgram(props.programId, wb);
    const hasRealData = result.periods.some((p) =>
      p.metrics.some((m) => !m.isPlaceholder && m.actual !== 0),
    );
    if (!hasRealData) return undefined;
    return {
      periods: result.periods,
      warnings: result.warnings,
      quarterly: result.quarterly,
      unutilizedFunds: result.unutilizedFunds,
    };
  } catch {
    return undefined;
  }
}

function findShadowedPeriods(parsedData: {
  periods: { year: number; quarter?: string; scope: string; label: string }[];
}): { scope: string; label: string; fileName: string; uploadedBy: string }[] {
  const conflicts: {
    scope: string;
    label: string;
    fileName: string;
    uploadedBy: string;
  }[] = [];
  for (const entry of parsedData.periods) {
    const match = existingPeriods.value.find(
      ({ period }) =>
        period.year === entry.year &&
        period.quarter === entry.quarter &&
        period.scope === entry.scope,
    );
    if (match) {
      conflicts.push({
        scope: entry.scope,
        label: entry.label,
        fileName: match.file.fileName,
        uploadedBy: match.file.uploadedByName,
      });
    }
  }
  return conflicts;
}
async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const parsedData = await tryParseXlsx(file);

  if (parsedData) {
    const conflicts = findShadowedPeriods(parsedData as { periods: any[] });
    if (conflicts.length > 0) {
      const ok = await confirmAction({
        title: "Overwrite Existing Data?",
        message: "This will replace existing dashboard data for:",
        items: conflicts.map(
          (c) =>
            `${c.scope} (${c.label}) — currently from "${c.fileName}", uploaded by ${c.uploadedBy}`,
        ),
        confirmLabel: "Upload Anyway",
        danger: true,
      });
      if (!ok) return;
    }
  }

  uploading.value = true;
  uploadProgress.value = 0;
  try {
    await uploadFileWithProgress(
      props.programId,
      currentFolderId.value,
      file,
      (percent) => {
        uploadProgress.value = percent;
      },
      parsedData,
    );
    showToast(`"${file.name}" uploaded.`, "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Upload failed. Please try again.",
      "error",
    );
  } finally {
    uploading.value = false;
  }
}

// --- Kebab menu state ---
interface MenuTarget {
  kind: "folder" | "file";
  folder?: FolderRecord;
  file?: FileRecord;
}
const openMenu = ref<MenuTarget | null>(null);
const menuPosition = ref({ top: 0, left: 0 });

function showMenu(target: MenuTarget, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const MENU_WIDTH = 192;
  let left = Math.max(
    8,
    Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
  );
  const top =
    window.innerHeight - rect.bottom >= 260 ? rect.bottom + 4 : rect.top - 264;
  menuPosition.value = { top: Math.max(8, top), left };
  openMenu.value = target;
  // Close on any click outside the menu, or on any navigation away from
  // this folder. Registered fresh each time the menu opens; removed the
  // moment it closes so it never lingers or stacks up duplicate listeners.
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}
function closeMenu() {
  openMenu.value = null;
  document.removeEventListener("click", closeMenu);
}

// --- Folder actions ---
async function handleFolderRename() {
  const folder = openMenu.value?.folder;
  closeMenu();
  if (!folder) return;
  const name = await promptAction({
    title: "Rename Folder",
    defaultValue: folder.name,
    confirmLabel: "Rename",
  });
  if (!name || name === folder.name) return;
  try {
    await renameFolder(props.programId, folder.id, name);
    showToast("Folder renamed.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not rename folder.",
      "error",
    );
  }
}

async function handleFolderDelete() {
  const folder = openMenu.value?.folder;
  closeMenu();
  if (!folder) return;
  const ok = await confirmAction({
    title: "Retire Folder",
    message: `Retire "${folder.name}"? It will be hidden from the explorer.`,
    confirmLabel: "Retire",
    danger: true,
  });
  if (!ok) return;
  try {
    await retireFolder(props.programId, folder.id);
    showToast("Folder retired.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not retire folder.",
      "error",
    );
  }
}

// --- File actions ---
function handleFileDownload() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  window.open(getDownloadUrl(file.id), "_blank");
}

async function handleFileRename() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  const name = await promptAction({
    title: "Rename File",
    defaultValue: file.original_name,
    confirmLabel: "Rename",
  });
  if (!name || name === file.original_name) return;
  try {
    await renameFile(file.id, name);
    showToast("File renamed.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not rename file.",
      "error",
    );
  }
}

async function handleFileToggleLock() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  try {
    await toggleFileLock(file.id);
    showToast(file.locked ? "File unlocked." : "File locked.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not update file.",
      "error",
    );
  }
}

async function handleFileDelete() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  const ok = await confirmAction({
    title: "Delete File",
    message: `Permanently delete "${file.original_name}"? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteFile(file.id);
    showToast("File deleted.", "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not delete file.",
      "error",
    );
  }
}

// --- Move (folders and files, shared destination picker) ---
const moveTarget = ref<MenuTarget | null>(null);
const moveDestination = ref<number | "">("");

const moveDestinationOptions = computed(() => {
  return allFolders.value
    .filter(
      (f) =>
        !(
          moveTarget.value?.kind === "folder" &&
          f.id === moveTarget.value.folder?.id
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
});

function openMove() {
  moveTarget.value = openMenu.value;
  moveDestination.value = "";
  closeMenu();
}

async function confirmMove() {
  if (!moveTarget.value) return;
  const destId = moveDestination.value === "" ? null : moveDestination.value;
  try {
    if (moveTarget.value.kind === "file" && moveTarget.value.file) {
      await moveFile(moveTarget.value.file.id, destId);
      showToast("File moved.", "success");
    }
    if (moveTarget.value.kind === "folder") {
      showToast(
        "Moving folders isn't supported yet — only files can be moved for now.",
        "error",
      );
    }
    moveTarget.value = null;
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not move item.",
      "error",
    );
  }
}

// --- Info modal ---
const infoTarget = ref<MenuTarget | null>(null);
const previewTarget = ref<FileRecord | null>(null);

function openInfo() {
  infoTarget.value = openMenu.value;
  closeMenu();
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
function handleFileOpen(file: FileRecord) {
  if (isPreviewable(file.mime_type)) {
    previewTarget.value = file;
  } else {
    window.open(getDownloadUrl(file.id), "_blank");
  }
}
function handleFilePreview() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  previewTarget.value = file;
}

function hasParsedData(file: FileRecord): boolean {
  return !!file.parsed_data && Array.isArray((file.parsed_data as any).periods);
}

function handleViewData() {
  const file = openMenu.value?.file;
  closeMenu();
  if (!file) return;
  router.push({
    name: "upload-history-view",
    params: { programId: props.programId, uploadId: file.id },
  });
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.name }} — Files
      </h1>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <div class="flex items-center justify-end mb-4 gap-3">
        <div class="flex items-center gap-2">
          <div class="flex border border-black/10 rounded overflow-hidden">
            <button
              @click="layout = 'list'"
              class="px-3 py-1.5 text-xs"
              :class="
                layout === 'list'
                  ? 'bg-dole-blue text-white'
                  : 'bg-white text-black/60'
              "
            >
              List
            </button>
            <button
              @click="layout = 'grid'"
              class="px-3 py-1.5 text-xs"
              :class="
                layout === 'grid'
                  ? 'bg-dole-blue text-white'
                  : 'bg-white text-black/60'
              "
            >
              Grid
            </button>
          </div>
          <template v-if="canManage">
            <button
              @click="handleNewFolder"
              class="border border-dole-blue text-dole-blue text-sm px-3 py-1.5 rounded hover:bg-dole-blue/5 transition"
            >
              + Folder
            </button>
            <button
              @click="triggerUpload"
              :disabled="uploading"
              class="bg-dole-blue text-white text-sm px-3 py-1.5 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
            >
              {{ uploading ? `Uploading… ${uploadProgress}%` : "+ Upload" }}
            </button>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              @change="handleFileSelected"
            />
          </template>
        </div>
      </div>

      <div class="bg-white border border-black/10 rounded-lg p-4">
        <p v-if="loading" class="text-sm text-black/50">Loading...</p>
        <p v-else-if="loadError" class="text-sm text-red-600">
          {{ loadError }}
        </p>
        <p
          v-else-if="childFolders.length === 0 && files.length === 0"
          class="text-sm text-black/50"
        >
          This folder is empty.
        </p>

        <template v-else>
          <!-- List header -->
          <div
            v-if="layout === 'list'"
            class="hidden sm:grid grid-cols-[1fr_140px_180px_100px_40px] gap-3 px-3 pb-2 mb-1 border-b border-black/10 text-xs font-medium text-black/40 uppercase tracking-wide"
          >
            <span>Name</span>
            <span>Owner</span>
            <span>Modified</span>
            <span>Size</span>
            <span></span>
          </div>

          <div
            :class="
              layout === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
                : 'space-y-0.5'
            "
          >
            <ExplorerItem
              v-for="folder in childFolders"
              :key="'folder-' + folder.id"
              :layout="layout"
              kind="folder"
              :folder="folder"
              :can-manage="canManage"
              @open="openFolder(folder)"
              @menu="showMenu({ kind: 'folder', folder }, $event)"
            />
            <ExplorerItem
              v-for="file in files"
              :key="'file-' + file.id"
              :layout="layout"
              kind="file"
              :file="file"
              :can-manage="canManage"
              @open="handleFileOpen(file)"
              @menu="showMenu({ kind: 'file', file }, $event)"
            />
          </div>
        </template>
      </div>
    </main>

    <ExplorerMenu
      v-if="openMenu"
      :position="menuPosition"
      :kind="openMenu.kind"
      :locked="openMenu.file?.locked"
      :previewable="
        openMenu.file ? isPreviewable(openMenu.file.mime_type) : false
      "
      :has-data="openMenu.file ? hasParsedData(openMenu.file) : false"
      @preview="handleFilePreview"
      @view-data="handleViewData"
      @rename="
        openMenu.kind === 'folder' ? handleFolderRename() : handleFileRename()
      "
      @move="openMove"
      @download="handleFileDownload"
      @copy="
        showToast('Make a Copy is not built yet.', 'error');
        closeMenu();
      "
      @info="openInfo"
      @toggle-lock="handleFileToggleLock"
      @delete="
        openMenu.kind === 'folder' ? handleFolderDelete() : handleFileDelete()
      "
    />

    <!-- Move modal -->
    <Modal v-if="moveTarget" title="Move" @close="moveTarget = null">
      <label class="block text-sm font-medium text-black/70 mb-1"
        >Destination folder</label
      >
      <select
        v-model="moveDestination"
        class="w-full border border-black/20 rounded px-3 py-2"
      >
        <option value="">Root (Unfiled)</option>
        <option v-for="f in moveDestinationOptions" :key="f.id" :value="f.id">
          {{ f.name }}
        </option>
      </select>
      <template #footer>
        <button
          @click="moveTarget = null"
          class="text-sm text-black/60 px-4 py-2 hover:text-black"
        >
          Cancel
        </button>
        <button
          @click="confirmMove"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          Move
        </button>
      </template>
    </Modal>

    <!-- Info modal -->
    <Modal
      v-if="infoTarget"
      :title="infoTarget.folder?.name ?? infoTarget.file?.original_name ?? ''"
      @close="infoTarget = null"
    >
      <dl class="text-sm space-y-2">
        <div v-if="infoTarget.file" class="flex justify-between">
          <dt class="text-black/50">File Type</dt>
          <dd>{{ infoTarget.file.mime_type }}</dd>
        </div>
        <div v-if="infoTarget.file" class="flex justify-between">
          <dt class="text-black/50">Size</dt>
          <dd>{{ formatSize(infoTarget.file.size_bytes) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Owner</dt>
          <dd>{{ infoTarget.file?.uploader?.name ?? "—" }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Created</dt>
          <dd>
            {{
              formatDateTime((infoTarget.folder ?? infoTarget.file)!.created_at)
            }}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Modified</dt>
          <dd>
            {{
              formatDateTime((infoTarget.folder ?? infoTarget.file)!.updated_at)
            }}
          </dd>
        </div>
        <div
          v-if="infoTarget.file?.description"
          class="pt-2 border-t border-black/10"
        >
          <dt class="text-black/50 mb-1">Description</dt>
          <dd class="text-black/70">{{ infoTarget.file.description }}</dd>
        </div>
      </dl>
      <div
        class="mt-4 pt-4 border-t border-black/10 text-xs text-black/40 space-y-1"
      >
        <p>Who Has Access — coming soon</p>
        <p>Activity log — coming soon</p>
        <p v-if="infoTarget.file">Version history — coming soon</p>
      </div>
    </Modal>
    <PreviewModal
      v-if="previewTarget"
      :file="previewTarget"
      @close="previewTarget = null"
    />
  </div>
  <div v-else class="p-8 text-black/60">Program not found.</div>
</template>
