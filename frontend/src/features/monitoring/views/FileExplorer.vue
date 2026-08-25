<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import * as XLSX from "xlsx";
import { hasParser, parseWorkbookForProgram } from "../parsers";
import {
  ensureCategoriesLoaded,
  activeCategories,
  categoriesLoading,
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
import {
  queueUpload,
  getQueuedUploads,
  flushQueue,
  isQueueGettingLarge,
} from "../data/uploadQueue";
import {
  getActivityLog,
  actionLabel,
  actionDetail,
  type ActivityLogEntry,
} from "../data/activityLogStore";
import PreviewModal from "../components/PreviewModal.vue";
import { useFloatingMenu } from "../../../composables/useFloatingMenu";

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
  folderPath?: string[] | string;
}>();

// Vue Router's repeatable optional param (:folderPath*) sometimes resolves
// an empty path segment back as "" instead of [] — normalize defensively
// here rather than relying on every caller to always pass a real array.
const normalizedFolderPath = computed<string[]>(() => {
  if (Array.isArray(props.folderPath)) return props.folderPath;
  if (!props.folderPath) return [];
  return [props.folderPath];
});
const router = useRouter();
const program = computed(() =>
  activeCategories.value.find((c) => c.code === props.programId),
);
const { confirmAction } = useConfirm();
const { promptAction } = usePrompt();
const { showToast } = useToast();

const canManage = computed(() => canManageFolders(props.programId));
const { periods: existingPeriods } = useProgramFiles(props.programId);
const LAYOUT_STORAGE_KEY = "tssd-file-explorer-layout";

// --- Kebab menu state (shared floating-menu logic — see useFloatingMenu.ts) ---
interface MenuTarget {
  kind: "folder" | "file";
  folder?: FolderRecord;
  file?: FileRecord;
}
const {
  openTarget: openMenu,
  position: menuPosition,
  openMenu: showMenu,
  closeMenu,
} = useFloatingMenu<MenuTarget>();

// --- Navigation: current folder + breadcrumb trail, derived from the URL ---
const folderIds = computed<number[]>(() =>
  normalizedFolderPath.value.map((id) => Number(id)),
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

function getStoredLayout(): "grid" | "list" {
  const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
  return stored === "grid" || stored === "list" ? stored : "list";
}

const layout = ref<"grid" | "list">(getStoredLayout());

watch(layout, (newLayout) => {
  localStorage.setItem(LAYOUT_STORAGE_KEY, newLayout);
});

const nameFilter = ref("");

const filteredChildFolders = computed(() => {
  const q = nameFilter.value.trim().toLowerCase();
  if (!q) return childFolders.value;
  return childFolders.value.filter((f) => f.name.toLowerCase().includes(q));
});

const filteredFiles = computed(() => {
  const q = nameFilter.value.trim().toLowerCase();
  if (!q) return files.value;
  return files.value.filter((f) => f.original_name.toLowerCase().includes(q));
});

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
const queuedCount = ref(0);
function triggerUpload() {
  fileInput.value?.click();
}

async function refreshQueuedCount() {
  queuedCount.value = (await getQueuedUploads()).length;
}

async function tryFlushQueue() {
  if (!navigator.onLine) return;
  const before = (await getQueuedUploads()).length;
  if (before === 0) return;
  const { succeeded, failed } = await flushQueue();
  await refreshQueuedCount();
  if (succeeded > 0) {
    showToast(
      succeeded === 1
        ? "1 queued file uploaded."
        : `${succeeded} queued files uploaded.`,
      "success",
    );
    await loadAll();
  }
  if (failed > 0) {
    showToast(
      `${failed} queued file(s) still couldn't upload — will retry later.`,
      "error",
    );
  }
}

onMounted(refreshQueuedCount);
onMounted(tryFlushQueue);
onMounted(() => window.addEventListener("online", tryFlushQueue));
onUnmounted(() => window.removeEventListener("online", tryFlushQueue));

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
async function processUpload(file: File) {
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

  if (!navigator.onLine) {
    await queueUpload({
      programId: props.programId,
      folderId: currentFolderId.value,
      file,
      parsedData,
    });
    await refreshQueuedCount();
    showToast(
      `"${file.name}" saved — no connection. Will upload automatically once you're back online.`,
      "success",
    );
    if (isQueueGettingLarge(queuedCount.value)) {
      showToast(
        `${queuedCount.value} files are waiting to upload. Check your connection when you can.`,
        "error",
      );
    }
    return;
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
    const isNetworkError =
      err instanceof TypeError || (err as any)?.status === undefined;
    if (isNetworkError) {
      await queueUpload({
        programId: props.programId,
        folderId: currentFolderId.value,
        file,
        parsedData,
      });
      await refreshQueuedCount();
      showToast(
        `"${file.name}" saved — connection issue. Will retry automatically.`,
        "success",
      );
    } else {
      showToast(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
        "error",
      );
    }
  } finally {
    uploading.value = false;
  }
}

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  await processUpload(file);
}

// --- Drag and drop ---
const isDraggingOver = ref(false);
let dragCounter = 0;

function handleDragEnter(e: DragEvent) {
  if (!canManage.value) return;
  e.preventDefault();
  dragCounter++;
  isDraggingOver.value = true;
}

function handleDragOver(e: DragEvent) {
  if (!canManage.value) return;
  e.preventDefault();
}

function handleDragLeave(e: DragEvent) {
  if (!canManage.value) return;
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDraggingOver.value = false;
  }
}

async function handleDrop(e: DragEvent) {
  if (!canManage.value) return;
  e.preventDefault();
  dragCounter = 0;
  isDraggingOver.value = false;

  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  await processUpload(file);
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

function resolveFolderName(id: number): string | undefined {
  return allFolders.value.find((f) => f.id === id)?.name;
}

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

// --- Activity log (Info modal) ---
const activityLog = ref<ActivityLogEntry[]>([]);
const activityLoading = ref(false);
const activityError = ref("");

watch(infoTarget, async (target) => {
  activityLog.value = [];
  activityError.value = "";
  if (!target) return;

  const subjectType = target.kind === "folder" ? "Folder" : "File";
  const subjectId = target.folder?.id ?? target.file?.id;
  if (!subjectId) return;

  activityLoading.value = true;
  try {
    activityLog.value = await getActivityLog(subjectType, subjectId);
  } catch (err) {
    activityError.value =
      err instanceof Error ? err.message : "Could not load activity log.";
  } finally {
    activityLoading.value = false;
  }
});

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
  <div
    v-if="categoriesLoading"
    class="min-h-screen bg-paper flex items-center justify-center"
  >
    <div class="flex flex-col items-center gap-3 text-black/60">
      <div
        class="w-8 h-8 border-2 border-black/10 border-t-dole-blue rounded-full animate-spin"
      ></div>
      <p class="text-sm">Loading program…</p>
    </div>
  </div>

  <div
    v-else-if="program"
    class="min-h-screen bg-paper relative"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">
        {{ program.name }} — Files
      </h1>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10 relative">
      <div
        v-if="isDraggingOver"
        class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center pointer-events-none"
      >
        <div
          class="bg-white rounded-2xl px-12 py-10 flex flex-col items-center gap-3 border-2 border-dashed border-dole-blue"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-12 h-12 text-dole-blue"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <polyline points="7 9 12 4 17 9" />
            <line x1="12" y1="4" x2="12" y2="16" />
          </svg>
          <p class="text-dole-blue font-medium text-lg">
            Drop file here to upload
          </p>
        </div>
      </div>
      <div class="flex items-center justify-between mb-4 gap-3">
        <input
          v-model="nameFilter"
          type="text"
          placeholder="Filter by name..."
          class="border border-black/20 rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-dole-blue"
        />
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
            <span
              v-if="queuedCount > 0"
              class="text-xs px-2 py-1 rounded-full"
              :class="
                queuedCount >= 5
                  ? 'bg-dole-red/10 text-dole-red'
                  : 'bg-dole-gold/20 text-dole-blue-dark'
              "
            >
              {{ queuedCount }} waiting to upload
            </span>
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
        <div v-if="loading" class="space-y-2 animate-pulse">
          <div
            v-for="i in 5"
            :key="i"
            class="flex items-center gap-3 px-3 py-2"
          >
            <div class="w-8 h-8 bg-black/10 rounded"></div>
            <div class="flex-1 h-4 bg-black/10 rounded"></div>
            <div class="w-24 h-4 bg-black/10 rounded hidden sm:block"></div>
            <div class="w-20 h-4 bg-black/10 rounded hidden sm:block"></div>
          </div>
        </div>
        <p v-else-if="loadError" class="text-sm text-red-600">
          {{ loadError }}
        </p>
        <p
          v-else-if="
            filteredChildFolders.length === 0 && filteredFiles.length === 0
          "
          class="text-sm text-black/50"
        >
          {{
            nameFilter.trim()
              ? `No files or folders match "${nameFilter}".`
              : "This folder is empty."
          }}
        </p>

        <template v-else>
          <!-- List header -->
          <div
            v-if="layout === 'list'"
            class="hidden sm:grid grid-cols-[1fr_140px_180px_100px_40px] gap-3 px-3 pb-2 mb-1 border-b border-black/10 text-xs font-medium text-black/60 uppercase tracking-wide"
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
              v-for="folder in filteredChildFolders"
              :key="'folder-' + folder.id"
              :layout="layout"
              kind="folder"
              :folder="folder"
              :can-manage="canManage"
              @open="openFolder(folder)"
              @menu="showMenu({ kind: 'folder', folder }, $event)"
            />
            <ExplorerItem
              v-for="file in filteredFiles"
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
        class="mt-4 pt-4 border-t border-black/10 text-xs text-black/60 space-y-1"
      >
        <p>Who Has Access — coming soon</p>
        <div class="pt-2">
          <p class="text-black/50 mb-1">Activity log</p>
          <p v-if="activityLoading" class="text-black/60">Loading…</p>
          <p v-else-if="activityError" class="text-red-600">
            {{ activityError }}
          </p>
          <p v-else-if="activityLog.length === 0" class="text-black/60">
            No activity recorded yet.
          </p>
          <ul v-else class="space-y-1 max-h-40 overflow-y-auto">
            <li
              v-for="entry in activityLog"
              :key="entry.id"
              class="text-black/70"
            >
              <span class="font-medium">{{ entry.actor_name }}</span>
              {{ actionLabel(entry.action).toLowerCase() }}
              <span v-if="actionDetail(entry, resolveFolderName)">
                — {{ actionDetail(entry, resolveFolderName) }}</span
              >
              <span class="text-black/60">
                - {{ formatDateTime(entry.created_at) }}</span
              >
            </li>
          </ul>
        </div>
        <p v-if="infoTarget.file">Version history — coming soon</p>
      </div>
    </Modal>
    <PreviewModal
      v-if="previewTarget"
      :file="previewTarget"
      @close="previewTarget = null"
    />
  </div>
  <div v-else class="min-h-screen bg-paper flex items-center justify-center">
    <div class="flex flex-col items-center gap-3 text-center max-w-sm">
      <div
        class="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-black/50 text-xl"
      >
        ?
      </div>
      <p class="font-medium text-black/70">Program not found</p>
      <p class="text-sm text-black/50">
        This program doesn't exist or may have been removed. Check the link, or
        go back to Documents.
      </p>
      <router-link
        :to="{ name: 'documents' }"
        class="mt-2 text-sm text-dole-blue underline hover:no-underline"
      >
        Back to Documents
      </router-link>
    </div>
  </div>
</template>
