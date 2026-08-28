<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getMyOAuthLinks,
  unlinkOAuthAccount,
  startGoogleLink,
  oauthErrorMessage,
  googleSignInEnabled,
  type OAuthAccountLink,
} from "../data/oauthLinkService";
import { useToast } from "../../../composables/useToast";
import { useConfirm } from "../../../composables/useConfirm";

const { showToast } = useToast();
const { confirmAction } = useConfirm();
const route = useRoute();
const router = useRouter();

const links = ref<OAuthAccountLink[]>([]);
const loading = ref(true);
const busy = ref(false);

const activeLink = computed(() =>
  links.value.find((l) => l.status === "pending" || l.status === "approved"),
);
const lastRejected = computed(() =>
  activeLink.value
    ? undefined
    : [...links.value]
        .filter((l) => l.status === "rejected")
        .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0],
);

async function loadLinks() {
  loading.value = true;
  try {
    links.value = await getMyOAuthLinks();
  } catch {
    showToast("Could not load your Google account status.", "error");
  } finally {
    loading.value = false;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function handleLink() {
  startGoogleLink();
}

async function handleUnlink() {
  if (!activeLink.value) return;
  const isApproved = activeLink.value.status === "approved";
  const ok = await confirmAction({
    title: isApproved ? "Unlink Google Account" : "Cancel Request",
    message: isApproved
      ? "You won't be able to sign in with this Google account anymore."
      : "Cancel this pending link request?",
    confirmLabel: isApproved ? "Unlink" : "Cancel Request",
    danger: true,
  });
  if (!ok) return;

  busy.value = true;
  try {
    await unlinkOAuthAccount(activeLink.value.id);
    await loadLinks();
    showToast(isApproved ? "Google account unlinked." : "Request cancelled.", "success");
  } catch {
    showToast("Could not update your Google account link.", "error");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await loadLinks();

  // Landed here from the /auth/google/callback redirect — surface the
  // result once, then strip the query param so a refresh doesn't repeat it.
  if (route.query.oauth_link === "pending") {
    showToast(
      "Google account link requested — waiting on Chief approval.",
      "success",
    );
    router.replace({ query: { ...route.query, oauth_link: undefined } });
  } else if (typeof route.query.oauth_error === "string") {
    showToast(oauthErrorMessage(route.query.oauth_error), "error");
    router.replace({ query: { ...route.query, oauth_error: undefined } });
  }
});
</script>

<template>
  <div class="bg-white border border-black/10 rounded-lg p-6 max-w-lg">
    <h2 class="font-display text-lg font-semibold text-dole-blue mb-1">
      Google Account
    </h2>
    <p class="text-sm text-black/60 mb-4">
      Link a Google account (personal or work) to sign in without your
      password. Requires Chief approval before it can be used.
    </p>

    <div v-if="loading" class="text-sm text-black/50">Loading…</div>

    <template v-else>
      <div
        v-if="activeLink"
        class="flex justify-between items-center border border-black/10 rounded p-3 mb-4"
      >
        <div>
          <p class="text-sm font-medium">
            {{ activeLink.provider_email ?? "Google account" }}
          </p>
          <p class="text-xs mt-0.5">
            <span
              v-if="activeLink.status === 'pending'"
              class="text-dole-blue-dark bg-dole-gold/25 px-1.5 py-0.5 rounded"
            >
              Awaiting Chief approval
            </span>
            <span
              v-else
              class="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
            >
              Linked — can be used to sign in
            </span>
            <span class="text-black/50 ml-1">
              Requested {{ formatDate(activeLink.requested_at) }}
            </span>
          </p>
        </div>
        <button
          @click="handleUnlink"
          :disabled="busy"
          class="text-xs text-dole-red hover:underline disabled:opacity-50"
        >
          {{ activeLink.status === "pending" ? "Cancel" : "Unlink" }}
        </button>
      </div>

      <template v-else>
        <p v-if="lastRejected" class="text-sm text-dole-red mb-3">
          Your last request ({{ lastRejected.provider_email }}) was declined{{
            lastRejected.rejection_reason ? `: ${lastRejected.rejection_reason}` : "."
          }}
          <template v-if="googleSignInEnabled">You can try linking again.</template>
        </p>
        <p v-else class="text-sm text-black/50 mb-4">
          No Google account linked yet.
        </p>
        <button
          v-if="googleSignInEnabled"
          @click="handleLink"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          Link Google Account
        </button>
        <p v-else class="text-sm text-black/50 italic">
          Google sign-in is not currently enabled for this system.
        </p>
      </template>
    </template>
  </div>
</template>
