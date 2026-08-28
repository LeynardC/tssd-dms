<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { login, getCurrentUser, ApiError } from "../authService";
import { setCurrentUser } from "../authStore";
import { twoFactorChallenge } from "../data/twoFactorService";
import { loginWithPasskey } from "../data/passkeyService";
import {
  startGoogleLogin,
  oauthErrorMessage,
  googleSignInEnabled,
} from "../data/oauthLinkService";
import doleLogo from "../../../assets/dole-logo.png";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const showPassword = ref(false); // NEW

const awaitingTwoFactor = ref(false);
const twoFactorCode = ref("");
const useRecoveryCode = ref(false);
const recoveryCodeInput = ref("");
const twoFactorError = ref("");
const passkeyLoading = ref(false);

// Landed back here from /auth/google/callback with an error to show —
// e.g. "still awaiting Chief approval."
onMounted(() => {
  if (typeof route.query.oauth_error === "string") {
    error.value = oauthErrorMessage(route.query.oauth_error);
    router.replace({ query: { ...route.query, oauth_error: undefined } });
  }
});

function handleGoogleLogin() {
  startGoogleLogin();
}

async function handlePasskeyLogin() {
  error.value = "";
  passkeyLoading.value = true;
  try {
    await loginWithPasskey();
    const user = await getCurrentUser();
    if (!user) {
      error.value = "Signed in but the session could not be confirmed.";
      return;
    }
    setCurrentUser(user);
    router.push("/monitoring");
  } catch (err) {
    // Covers both a cancelled/failed WebAuthn prompt and a real server
    // rejection — either way, this isn't the user's password failing,
    // so keep the message specific to passkeys rather than reusing the
    // generic login error copy.
    error.value =
      err instanceof ApiError
        ? err.message
        : "Passkey sign-in didn't work. You can try again or use your password.";
  } finally {
    passkeyLoading.value = false;
  }
}

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    const result = await login(
      username.value.trim().toLowerCase(),
      password.value,
    );
    if (result.two_factor) {
      // Fortify itself told us 2FA is required — no speculative
      // getCurrentUser() call, no false-alarm 401 in the console.
      awaitingTwoFactor.value = true;
      return;
    }
    const user = await getCurrentUser();
    if (!user) {
      error.value =
        "Login succeeded but the session could not be confirmed. Please try again.";
      return;
    }
    setCurrentUser(user);
    router.push("/monitoring");
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.errors
          ? Object.values(err.errors).flat().join(" ")
          : err.message
        : "Something went wrong. Please try again.";
  } finally {
    loading.value = false;
  }
}

async function handleTwoFactorSubmit() {
  twoFactorError.value = "";
  loading.value = true;
  try {
    await twoFactorChallenge(
      useRecoveryCode.value
        ? { recovery_code: recoveryCodeInput.value }
        : { code: twoFactorCode.value },
    );
    const user = await getCurrentUser();
    if (!user) {
      twoFactorError.value = "Could not confirm the session. Please try again.";
      return;
    }
    setCurrentUser(user);
    router.push("/monitoring");
  } catch (err) {
    twoFactorError.value =
      err instanceof ApiError
        ? err.errors
          ? Object.values(err.errors).flat().join(" ")
          : err.message
        : "That code didn't work. Please try again.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper flex items-center justify-center px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-10">
        <img
          :src="doleLogo"
          alt="DOLE Logo"
          class="w-20 h-20 mx-auto mb-4 object-contain"
        />
        <p class="text-sm tracking-wide text-dole-blue/70 uppercase">
          DOLE MIMAROPA — TSSD
        </p>
        <h1 class="font-display text-3xl font-semibold text-dole-blue mt-2">
          Sign In
        </h1>
      </div>
      <form
        v-if="!awaitingTwoFactor"
        @submit.prevent="handleSubmit"
        class="bg-white border-2 border-black/10 rounded-lg p-8 space-y-5"
      >
        <div>
          <label
            for="login-username"
            class="block text-sm font-medium text-black/70 mb-1"
            >Username</label
          >
          <input
            id="login-username"
            v-model="username"
            type="text"
            autocomplete="username"
            required
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          />
        </div>
        <div>
          <label
            for="login-password"
            class="block text-sm font-medium text-black/70 mb-1"
            >Password</label
          >
          <div class="relative">
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              class="w-full border border-black/20 rounded px-3 py-2 pr-10 focus:outline-none focus:border-dole-blue"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-black/60 hover:text-black/70"
              tabindex="-1"
            >
              <!-- Eye (visible) icon -->
              <svg
                v-if="!showPassword"
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <!-- Eye-off (hidden) icon -->
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path
                  d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 1 12s4 8 11 8a10.44 10.44 0 0 0 5.39-1.61"
                />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
        </div>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-dole-blue text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {{ loading ? "Signing in..." : "Sign In" }}
        </button>

        <div class="flex items-center gap-3 my-4">
          <div class="flex-1 h-px bg-black/10" />
          <span class="text-xs text-black/60 uppercase tracking-wide">or</span>
          <div class="flex-1 h-px bg-black/10" />
        </div>

        <button
          type="button"
          @click="handlePasskeyLogin"
          :disabled="passkeyLoading"
          class="w-full border border-dole-blue text-dole-blue rounded py-2 font-medium hover:bg-dole-blue/5 transition disabled:opacity-50"
        >
          {{ passkeyLoading ? "Verifying…" : "Sign in with a passkey" }}
        </button>

        <button
          v-if="googleSignInEnabled"
          type="button"
          @click="handleGoogleLogin"
          class="w-full border border-black/20 text-black/70 rounded py-2 font-medium hover:bg-black/5 transition mt-3"
        >
          Sign in with Google
        </button>
      </form>

      <form
        v-else
        @submit.prevent="handleTwoFactorSubmit"
        class="bg-white border-2 border-black/10 rounded-lg p-8 space-y-5"
      >
        <p class="text-sm text-black/60">
          Enter the code from your authenticator app.
        </p>
        <div v-if="!useRecoveryCode">
          <label
            for="tfa-login-code"
            class="block text-sm font-medium text-black/70 mb-1"
            >6-digit code</label
          >
          <input
            id="tfa-login-code"
            v-model="twoFactorCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            autofocus
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          />
        </div>
        <div v-else>
          <label
            for="tfa-login-recovery"
            class="block text-sm font-medium text-black/70 mb-1"
            >Recovery code</label
          >
          <input
            id="tfa-login-recovery"
            v-model="recoveryCodeInput"
            type="text"
            autofocus
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          />
        </div>
        <p v-if="twoFactorError" class="text-sm text-red-600">
          {{ twoFactorError }}
        </p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-dole-blue text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {{ loading ? "Verifying..." : "Verify" }}
        </button>
        <button
          type="button"
          @click="
            useRecoveryCode = !useRecoveryCode;
            twoFactorError = '';
          "
          class="w-full text-sm text-dole-blue hover:underline"
        >
          {{
            useRecoveryCode
              ? "Use an authenticator code instead"
              : "Use a recovery code instead"
          }}
        </button>
      </form>
    </div>
  </div>
</template>
