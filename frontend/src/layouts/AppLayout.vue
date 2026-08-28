<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentRole } from "../features/monitoring/role";
import ToastContainer from "../components/ToastContainer.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import PromptDialog from "../components/PromptDialog.vue";
import { logout } from "../features/auth/authService";
import { currentUser, setCurrentUser } from "../features/auth/authStore";
import {
  ensureProgramsLoaded,
  activePrograms,
} from "../features/programs/data/programCache";
import doleLogo from "../assets/dole-logo.jpg";
import {
  Home,
  FileText,
  BarChart3,
  Users,
  Tag,
  Building2,
  TrendingUp,
  Settings,
  Menu,
  FolderOpen,
  Folder,
  X,
} from "@lucide/vue";
import { useGlobalSearch } from "../composables/useGlobalSearch";

const route = useRoute();
const router = useRouter();

interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
  chiefOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Documents", icon: FileText, path: "/documents" },
  { label: "Monitoring", icon: BarChart3, path: "/monitoring" },
  { label: "Users & Roles", icon: Users, path: "/users", chiefOnly: true },
  { label: "Programs", icon: Tag, path: "/programs" },
  { label: "Units", icon: Building2, path: "/units", chiefOnly: true },
  { label: "Reports & Exports", icon: TrendingUp, path: "/reports" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

const visibleNavItems = computed(() =>
  navItems.filter((item) => !item.chiefOnly || currentRole.value === "chief"),
);

const {
  results: searchResults,
  loading: searchLoading,
  error: searchError,
  search: runSearch,
  clear: clearSearch,
  hasResults: hasSearchResults,
} = useGlobalSearch();

const searchQuery = ref("");
const searchOpen = ref(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
const searchContainer = ref<HTMLElement | null>(null);

function handleClickOutside(e: MouseEvent) {
  if (
    searchOpen.value &&
    searchContainer.value &&
    !searchContainer.value.contains(e.target as Node)
  ) {
    closeSearch();
  }
}

onMounted(() => document.addEventListener("click", handleClickOutside));
onUnmounted(() => document.removeEventListener("click", handleClickOutside));
onMounted(ensureProgramsLoaded);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + "/");
}

// Sidebar identity — name + position + the program/department they belong
// to, replacing the old flat "Staff View"/"Chief View" label. Chief isn't
// scoped to a single unit or program (she oversees all of them), so those
// fields stay null on her account and this falls back to a fixed label
// instead of trying to look one up.
const displayPosition = computed(
  () => currentUser.value?.position ?? (currentRole.value === "chief" ? "Chief" : "Staff"),
);
const displayProgram = computed(() => {
  if (currentRole.value === "chief") return "All Programs";
  const code = currentUser.value?.assigned_program;
  if (!code) return null;
  return activePrograms.value.find((p) => p.code === code)?.name ?? code;
});

// Mobile sidebar: hidden by default, toggled via hamburger, closed on
// navigation or backdrop tap. Desktop ignores this entirely (sidebar is
// always visible there via the md: breakpoint classes below).
const mobileMenuOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
    searchQuery.value = "";
    clearSearch();
    searchOpen.value = false;
  },
);

function handleSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (searchQuery.value.trim()) {
      runSearch(searchQuery.value);
      searchOpen.value = true;
    } else {
      clearSearch();
      searchOpen.value = false;
    }
  }, 300);
}

function closeSearch() {
  searchOpen.value = false;
}

function goToFile(programId: string, folderId: number | null) {
  router.push({
    name: "file-explorer",
    params: {
      programId,
      folderPath: folderId ? [String(folderId)] : [],
    },
  });
  closeSearch();
  searchQuery.value = "";
  clearSearch();
}

function goToMonitoring(result: {
  programId: string;
  year: number;
  quarter?: string;
  scope: string;
}) {
  const periodId = result.quarter
    ? `${result.year}-${result.quarter}`
    : `${result.year}`;
  router.push({
    name: "period-dashboard",
    params: { programId: result.programId, periodId, scope: result.scope },
  });
  closeSearch();
  searchQuery.value = "";
  clearSearch();
}

async function handleLogout() {
  try {
    await logout();
  } catch {
    // Even if the network call fails, still clear local state and redirect —
    // a stuck "logged in" UI is worse than a session that outlives its cookie.
  }
  setCurrentUser(null);
  router.push("/login");
}
</script>

<template>
  <div class="min-h-screen bg-paper flex">
    <!-- Mobile top bar: hamburger + brand, hidden on desktop -->
    <div
      class="lg:hidden print:hidden fixed top-0 left-0 right-0 h-14 bg-dole-blue text-white flex items-center gap-3 px-4 z-60"
    >
      <button
        @click="mobileMenuOpen = !mobileMenuOpen"
        class="p-1"
        :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
        :aria-expanded="mobileMenuOpen"
      >
        <component
          :is="mobileMenuOpen ? X : Menu"
          :size="24"
          class="transition-transform duration-200"
        />
      </button>
      <p v-if="!mobileMenuOpen" class="font-display text-base font-semibold">
        TSSD DMS
      </p>
    </div>

    <!-- Mobile backdrop, only rendered/visible when menu is open -->
    <div
      v-if="mobileMenuOpen"
      @click="mobileMenuOpen = false"
      class="lg:hidden fixed inset-0 bg-black/40 z-40"
    />

    <!-- Sidebar: always visible on desktop (md:translate-x-0, md:static);
         slides in/out as an overlay on mobile based on mobileMenuOpen -->
    <aside
      class="w-60 bg-dole-blue text-white flex flex-col shrink-0 fixed top-14 bottom-0 left-0 z-50 transition-transform duration-200 shadow-lg lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 print:hidden"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="px-5 py-6 border-b border-white/10 flex items-center gap-3">
        <div
          class="w-14 h-14 shrink-0 bg-white rounded-full flex items-center justify-center p-1.5 ring-2 ring-white/20 overflow-hidden"
        >
          <img
            :src="doleLogo"
            alt="DOLE Logo"
            class="w-full h-full object-contain"
          />
        </div>
        <div>
          <p class="text-xs tracking-wide text-white/80 uppercase">
            DOLE MIMAROPA
          </p>
          <p class="font-display text-lg font-semibold">TSSD DMS</p>
        </div>
      </div>

      <nav class="flex-1 py-4 overflow-y-auto">
        <router-link
          v-for="item in visibleNavItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-5 py-2.5 text-sm transition"
          :class="
            isActive(item.path)
              ? 'bg-white/10 border-l-4 border-dole-gold font-medium'
              : 'border-l-4 border-transparent text-white/80 hover:bg-white/5'
          "
        >
          <component :is="item.icon" :size="18" />
          {{ item.label }}
        </router-link>
      </nav>

      <div class="px-5 py-4 border-t border-white/10">
        <p class="text-sm font-medium text-white truncate">
          {{ currentUser?.name }}
        </p>
        <p class="text-xs text-white/80 mb-1 flex items-center gap-1.5">
          <component
            :is="currentRole === 'staff' ? FolderOpen : BarChart3"
            :size="14"
          />
          {{ displayPosition }}<span v-if="displayProgram"> · {{ displayProgram }}</span>
        </p>
        <button
          @click="handleLogout"
          class="text-xs underline text-white/70 hover:text-white"
        >
          Log out
        </button>
      </div>
    </aside>

    <!-- Main content: top padding on mobile to clear the fixed top bar -->
    <div class="relative flex-1 min-w-0 pt-14 lg:pt-0 print:pt-0 print:w-full">
      <!-- Global search bar — overlays top-right corner of whatever page header is rendering underneath -->
      <div
        ref="searchContainer"
        class="absolute top-4 right-4 z-30 w-72 print:hidden"
      >
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="handleSearchInput"
            @focus="searchQuery.trim() && (searchOpen = true)"
            type="text"
            placeholder="Search files, folders, staff, or monitoring data..."
            class="w-full border border-white/20 rounded px-3 py-1.5 pr-8 text-sm bg-white/95 focus:outline-none focus:border-dole-gold"
          />
          <button
            v-if="searchQuery"
            @click="
              searchQuery = '';
              clearSearch();
              searchOpen = false;
            "
            class="absolute right-2 top-1/2 -translate-y-1/2 text-black/60 hover:text-black/70 text-sm leading-none"
            aria-label="Clear search"
          >
            ✕
          </button>
        </div>

        <div
          v-if="searchOpen"
          class="absolute top-full right-0 mt-1 w-96 bg-white border border-black/10 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50"
        >
          <p v-if="searchLoading" class="text-sm text-black/50 p-4">
            Searching…
          </p>
          <p v-else-if="searchError" class="text-sm text-red-600 p-4">
            {{ searchError }}
          </p>
          <p v-else-if="!hasSearchResults()" class="text-sm text-black/60 p-4">
            No matches found.
          </p>
          <template v-else>
            <div v-if="searchResults.files.length" class="p-2">
              <p class="text-xs font-medium text-black/60 uppercase px-2 mb-1">
                Files
              </p>
              <button
                v-for="f in searchResults.files"
                :key="'f-' + f.id"
                @click="goToFile(f.program_id, f.folder_id)"
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-black/5 rounded truncate"
              >
                {{ f.original_name }}
                <span class="text-xs text-black/60 block">{{
                  f.program_id.toUpperCase()
                }}</span>
              </button>
            </div>
            <div
              v-if="searchResults.folders.length"
              class="p-2 border-t border-black/5"
            >
              <p class="text-xs font-medium text-black/60 uppercase px-2 mb-1">
                Folders
              </p>
              <button
                v-for="f in searchResults.folders"
                :key="'fo-' + f.id"
                @click="goToFile(f.program_id, f.id)"
                class="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm hover:bg-black/5 rounded"
              >
                <Folder :size="16" class="text-black/60 shrink-0" />
                <span class="truncate">{{ f.name }}</span>
                <span class="text-xs text-black/60 shrink-0 ml-auto">{{
                  f.program_id.toUpperCase()
                }}</span>
              </button>
            </div>
            <div
              v-if="searchResults.staff.length"
              class="p-2 border-t border-black/5"
            >
              <p class="text-xs font-medium text-black/60 uppercase px-2 mb-1">
                Users & Roles
              </p>
              <router-link
                v-for="s in searchResults.staff"
                :key="'s-' + s.id"
                :to="{ name: 'users' }"
                @click="closeSearch"
                class="block px-2 py-1.5 text-sm hover:bg-black/5 rounded truncate"
              >
                {{ s.name }}
                <span class="text-xs text-black/60 block">{{
                  s.username
                }}</span>
              </router-link>
            </div>
            <div
              v-if="searchResults.monitoring.length"
              class="p-2 border-t border-black/5"
            >
              <p class="text-xs font-medium text-black/60 uppercase px-2 mb-1">
                Monitoring
              </p>
              <button
                v-for="(m, i) in searchResults.monitoring"
                :key="'m-' + i"
                @click="goToMonitoring(m)"
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-black/5 rounded truncate"
              >
                {{ m.programName }} › {{ m.year
                }}{{ m.quarter ? " " + m.quarter : "" }} › {{ m.scope }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <router-view />
    </div>

    <ToastContainer />
    <ConfirmDialog /> <PromptDialog />
  </div>
</template>
