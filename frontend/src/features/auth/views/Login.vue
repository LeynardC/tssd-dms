<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login, getCurrentUser, ApiError } from "../authService";
import { setCurrentUser } from "../authStore";

const router = useRouter();
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const showPassword = ref(false); // NEW

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await login(username.value.trim().toLowerCase(), password.value);
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
</script>

<template>
  <div class="min-h-screen bg-paper flex items-center justify-center px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-10">
        <p class="text-sm tracking-wide text-dole-blue/70 uppercase">
          DOLE MIMAROPA — TSSD
        </p>
        <h1 class="font-display text-3xl font-semibold text-dole-blue mt-2">
          Sign In
        </h1>
      </div>
      <form
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
              class="absolute inset-y-0 right-0 flex items-center px-3 text-black/40 hover:text-black/70"
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
      </form>
    </div>
  </div>
</template>
