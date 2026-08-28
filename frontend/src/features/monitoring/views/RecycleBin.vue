<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Folder, FileText, RotateCcw, Trash2, Lock, Info } from "@lucide/vue";
import {
  ensureProgramsLoaded,
  activePrograms,
} from "../../programs/data/programCache";
import { canManageFolders } from "../data/folderStore";
import {
  getRecycleBin,
  restoreFolder,
  purgeFolder,
  restoreFile,
  purgeFile,
  emptyBin,
  type BinItem,
} from "../data/recycleBinStore";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import Breadcrumbs, { type Crumb } from "../../../components/Breadcrumbs.vue";

const props = defineProps<{ programId: string }>();

const { confirmAction } = useConfirm();
const { showToast } = useToast();

const program = computed(() =>
  activePrograms.value.find((p) => p.code === props.programId),
);
const canManage = computed(() => canManageFolders(props.programId));

const items = ref<BinItem[]>([]);
const loading = ref(true);
const loadError = ref("");

async function loadAll() {
  loading.value = true;
  loadError.value = "";
  try {
    items.value = await getRecycleBin(props.programId);
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : "Could not load the Recycle Bin.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
onMounted(ensureProgramsLoaded);

const crumbs = computed(
  () =>
    [
      { label: "Documents", to: { name: "documents" } },
      {
        label: program.value?.name ?? "",
        to: {
          name: "file-explorer",
          params: { programId: props.programId, folderPath: [] },
        },
      },
      { label: "Recycle Bin" },
    ] as Crumb[],
);

// --- Filter / search ---
const nameFilter = ref("");
const typeFilter = ref<"all" | "folder" | "file">("all");

const folderCount = computed(
  () => items.value.filter((i) => i.type === "folder").length,
);
const fileCount = computed(
  () => items.value.filter((i) => i.type === "file").length,
);

const filteredItems = computed(() => {
  const q = nameFilter.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (typeFilter.value !== "all" && item.type !== typeFilter.value)
      return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  });
});

// --- Countdown ---
type Urgency = "safe" | "warn" | "critical" | "locked" | "unknown";

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function isLocked(item: BinItem): boolean {
  return item.type === "folder" ? item.has_locked_file : item.locked;
}

function urgency(item: BinItem): Urgency {
  if (isLocked(item)) return "locked";
  const d = daysLeft(item.expires_at);
  if (d === null) return "unknown";
  if (d >= 7) return "safe";
  if (d >= 3) return "warn";
  return "critical";
}

function countdownLabel(item: BinItem): string {
  if (isLocked(item)) return "Locked — won't auto-delete";
  const d = daysLeft(item.expires_at);
  if (d === null) return "Expiry unknown";
  if (d <= 0) return "Deleting soon";
  if (d === 1) return "1 day left";
  return `${d} days left`;
}

const urgencyClasses: Record<Urgency, string> = {
  safe: "bg-emerald-50 text-emerald-700",
  warn: "bg-dole-gold/25 text-dole-blue-dark",
  critical: "bg-dole-red/10 text-dole-red",
  locked: "bg-black/5 text-black/60",
  unknown: "bg-black/5 text-black/50",
};

// --- Formatting ---
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
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
function retiredOrDeletedAt(item: BinItem): string | null {
  return item.type === "folder" ? item.retired_at : item.deleted_at;
}
function actedByName(item: BinItem): string {
  return (item.type === "folder" ? item.retired_by_name : item.deleted_by_name) ?? "—";
}
function subtitle(item: BinItem): string {
  if (item.type === "folder") {
    const parts: string[] = [];
    if (item.subfolder_count > 0)
      parts.push(
        `${item.subfolder_count} subfolder${item.subfolder_count === 1 ? "" : "s"}`,
      );
    parts.push(`${item.file_count} file${item.file_count === 1 ? "" : "s"}`);
    return `Folder · ${parts.join(", ")}`;
  }
  return `File · ${formatSize(item.size_bytes)}`;
}

// --- Actions ---
async function handleRestore(item: BinItem) {
  try {
    if (item.type === "folder") {
      await restoreFolder(item.id);
    } else {
      await restoreFile(item.id);
    }
    showToast(`"${item.name}" restored to its original location.`, "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not restore this item.",
      "error",
    );
  }
}

async function handlePurge(item: BinItem) {
  const ok = await confirmAction({
    title: "Delete Permanently?",
    message: `"${item.name}" will be removed for good${item.type === "folder" ? " — including everything inside it" : ""}. This can't be undone.`,
    confirmLabel: "Delete Permanently",
    danger: true,
  });
  if (!ok) return;

  try {
    if (item.type === "folder") {
      await purgeFolder(item.id);
    } else {
      await purgeFile(item.id);
    }
    showToast(`"${item.name}" deleted permanently.`, "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not permanently delete this item.",
      "error",
    );
  }
}

async function handleEmptyBin() {
  const ok = await confirmAction({
    title: "Empty Recycle Bin?",
    message: `Everything in this program's Recycle Bin will be permanently deleted. Locked items are skipped. This can't be undone.`,
    confirmLabel: "Empty Bin",
    danger: true,
  });
  if (!ok) return;

  try {
    const result = await emptyBin(props.programId);
    const parts: string[] = [];
    if (result.purged_folders) parts.push(`${result.purged_folders} folder(s)`);
    if (result.purged_files) parts.push(`${result.purged_files} file(s)`);
    let message = parts.length
      ? `Deleted ${parts.join(" and ")}.`
      : "Nothing to delete.";
    if (result.skipped_locked) {
      message += ` ${result.skipped_locked} item(s) skipped — locked.`;
    }
    showToast(message, "success");
    await loadAll();
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Could not empty the Recycle Bin.",
      "error",
    );
  }
}
</script>

<template>
  <div v-if="program" class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="font-display text-2xl font-semibold mt-1">Recycle Bin</h1>
      <p class="text-sm text-white/75 mt-1">
        Retired folders and deleted files from {{ program.name }}, kept for 30
        days.
      </p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10">
      <div
        class="flex items-start gap-3 bg-dole-gold/15 border border-dole-gold/40 text-dole-blue-dark rounded-lg px-4 py-3 mb-6 text-sm"
      >
        <Info :size="18" class="shrink-0 mt-0.5" />
        <p>
          <strong>Items are kept for 30 days</strong> after being retired or
          deleted, then removed automatically. Restore anything here before
          its timer runs out — after that it can't be recovered.
        </p>
      </div>

      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <input
          v-model="nameFilter"
          type="text"
          placeholder="Search Recycle Bin..."
          class="border border-black/20 rounded px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-dole-blue"
        />
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex border border-black/10 rounded overflow-hidden">
            <button
              @click="typeFilter = 'all'"
              class="px-3 py-1.5 text-xs"
              :class="
                typeFilter === 'all'
                  ? 'bg-dole-blue text-white'
                  : 'bg-white text-black/60'
              "
            >
              All ({{ items.length }})
            </button>
            <button
              @click="typeFilter = 'folder'"
              class="px-3 py-1.5 text-xs"
              :class="
                typeFilter === 'folder'
                  ? 'bg-dole-blue text-white'
                  : 'bg-white text-black/60'
              "
            >
              Folders ({{ folderCount }})
            </button>
            <button
              @click="typeFilter = 'file'"
              class="px-3 py-1.5 text-xs"
              :class="
                typeFilter === 'file'
                  ? 'bg-dole-blue text-white'
                  : 'bg-white text-black/60'
              "
            >
              Files ({{ fileCount }})
            </button>
          </div>
          <button
            v-if="canManage"
            @click="handleEmptyBin"
            :disabled="items.length === 0"
            class="border border-dole-red text-dole-red text-sm px-3 py-1.5 rounded hover:bg-dole-red/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Empty Bin
          </button>
        </div>
      </div>

      <div class="bg-white border border-black/10 rounded-lg p-4">
        <div v-if="loading" class="space-y-2 animate-pulse">
          <div
            v-for="i in 4"
            :key="i"
            class="flex items-center gap-3 px-3 py-2"
          >
            <div class="w-8 h-8 bg-black/10 rounded"></div>
            <div class="flex-1 h-4 bg-black/10 rounded"></div>
            <div class="w-24 h-4 bg-black/10 rounded hidden sm:block"></div>
          </div>
        </div>
        <p v-else-if="loadError" class="text-sm text-red-600">
          {{ loadError }}
        </p>
        <p
          v-else-if="filteredItems.length === 0"
          class="text-sm text-black/50"
        >
          {{
            items.length === 0
              ? "The Recycle Bin is empty."
              : "No items match your search."
          }}
        </p>

        <template v-else>
          <div
            class="hidden sm:grid grid-cols-[1fr_1fr_150px_150px_190px] gap-3 px-3 pb-2 mb-1 border-b border-black/10 text-xs font-medium text-black/60 uppercase tracking-wide"
          >
            <span>Name</span>
            <span>Originally In</span>
            <span>Retired/Deleted By</span>
            <span>Auto-deletes In</span>
            <span></span>
          </div>

          <div class="space-y-0.5">
            <div
              v-for="item in filteredItems"
              :key="item.type + '-' + item.id"
              class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_150px_150px_190px] gap-1 sm:gap-3 items-center px-3 py-2.5 rounded hover:bg-black/5"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Folder
                  v-if="item.type === 'folder'"
                  :size="18"
                  class="text-dole-blue shrink-0"
                />
                <FileText v-else :size="18" class="text-black/50 shrink-0" />
                <div class="min-w-0">
                  <p class="text-sm truncate">{{ item.name }}</p>
                  <p class="text-xs text-black/50 truncate">
                    {{ subtitle(item) }}
                  </p>
                </div>
              </div>
              <div class="text-xs text-black/60 truncate">
                {{ program.name }}<span v-if="item.origin_path"> / {{ item.origin_path }}</span>
              </div>
              <div class="text-xs text-black/60">
                <p>{{ actedByName(item) }}</p>
                <p class="text-black/40">{{ formatDateTime(retiredOrDeletedAt(item)) }}</p>
              </div>
              <div>
                <span
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                  :class="urgencyClasses[urgency(item)]"
                >
                  <Lock v-if="urgency(item) === 'locked'" :size="12" />
                  {{ countdownLabel(item) }}
                </span>
              </div>
              <div v-if="canManage" class="flex justify-start sm:justify-end gap-2">
                <button
                  @click="handleRestore(item)"
                  class="inline-flex items-center gap-1 text-xs font-medium border border-dole-blue text-dole-blue px-2.5 py-1.5 rounded hover:bg-dole-blue/5 transition"
                >
                  <RotateCcw :size="13" />
                  Restore
                </button>
                <button
                  @click="handlePurge(item)"
                  class="inline-flex items-center justify-center w-7 h-7 text-black/50 rounded hover:bg-dole-red/10 hover:text-dole-red transition"
                  aria-label="Delete Permanently"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <p class="text-xs text-black/50 mt-4">
        Showing {{ program.name }}'s Recycle Bin. Staff can only manage their
        assigned program; Chief can manage any program.
      </p>
    </main>
  </div>
  <div v-else class="min-h-screen bg-paper flex items-center justify-center">
    <div class="flex flex-col items-center gap-3 text-center max-w-sm">
      <p class="font-medium text-black/70">Program not found</p>
      <router-link
        :to="{ name: 'documents' }"
        class="mt-2 text-sm text-dole-blue underline hover:no-underline"
      >
        Back to Documents
      </router-link>
    </div>
  </div>
</template>
