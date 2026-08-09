<script setup lang="ts">
import { currentRole } from "../role";
import { useRouter } from "vue-router";
import { logout } from "../../auth/authService";
import { setCurrentUser } from "../../auth/authStore";

const router = useRouter();

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
  <div class="flex items-center gap-2 text-xs text-white/70">
    <span class="inline-flex items-center gap-1 bg-white/10 px-2 py-1 rounded">
      {{ currentRole === "staff" ? "🗂️ Staff View" : "📊 Chief View" }}
    </span>
    <button @click="handleLogout" class="underline hover:text-white">
      Log out
    </button>
  </div>
</template>
