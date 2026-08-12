<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { currentRole } from "../features/monitoring/role";
import ToastContainer from "../components/ToastContainer.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import PromptDialog from "../components/PromptDialog.vue";
import { logout } from "../features/auth/authService";
import { setCurrentUser } from "../features/auth/authStore";

const route = useRoute();
const router = useRouter();

interface NavItem {
  label: string;
  icon: string;
  path: string;
  chiefOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Home", icon: "🏠", path: "/home" },
  { label: "Documents", icon: "📄", path: "/documents" },
  { label: "Monitoring", icon: "📊", path: "/monitoring" },
  { label: "Users & Roles", icon: "👥", path: "/users", chiefOnly: true },
  { label: "Categories", icon: "🏷️", path: "/categories" },
  { label: "Units", icon: "🏢", path: "/units", chiefOnly: true },
  { label: "Reports & Exports", icon: "📈", path: "/reports" },
  { label: "Settings", icon: "⚙️", path: "/settings" },
];

const visibleNavItems = computed(() =>
  navItems.filter((item) => !item.chiefOnly || currentRole.value === "chief"),
);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + "/");
}

// Mobile sidebar: hidden by default, toggled via hamburger, closed on
// navigation or backdrop tap. Desktop ignores this entirely (sidebar is
// always visible there via the md: breakpoint classes below).
const mobileMenuOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
  },
);

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
      class="md:hidden fixed top-0 left-0 right-0 h-14 bg-dole-blue text-white flex items-center gap-3 px-4 z-40"
    >
      <button
        @click="mobileMenuOpen = !mobileMenuOpen"
        class="text-2xl leading-none p-1"
        aria-label="Toggle menu"
      >
        ☰
      </button>
      <p class="font-display text-base font-semibold">TSSD DMS</p>
    </div>

    <!-- Mobile backdrop, only rendered/visible when menu is open -->
    <div
      v-if="mobileMenuOpen"
      @click="mobileMenuOpen = false"
      class="md:hidden fixed inset-0 bg-black/40 z-40"
    />

    <!-- Sidebar: always visible on desktop (md:translate-x-0, md:static);
         slides in/out as an overlay on mobile based on mobileMenuOpen -->
    <aside
      class="w-60 bg-dole-blue text-white flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:translate-x-0"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="px-5 py-6 border-b border-white/10">
        <p class="text-[11px] tracking-wide text-white/60 uppercase">
          DOLE MIMAROPA
        </p>
        <p class="font-display text-lg font-semibold">TSSD DMS</p>
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
          <span>{{ item.icon }}</span>
          {{ item.label }}
        </router-link>
      </nav>

      <div class="px-5 py-4 border-t border-white/10">
        <p class="text-xs text-white/60 mb-1">
          {{ currentRole === "staff" ? "🗂️ Staff View" : "📊 Chief View" }}
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
    <div class="flex-1 min-w-0 pt-14 md:pt-0">
      <router-view />
    </div>

    <ToastContainer />
    <ConfirmDialog /> <PromptDialog />
  </div>
</template>
