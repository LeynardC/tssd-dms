<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  changePassword,
  logout,
  login,
  getCurrentUser,
  ApiError,
} from "../authService";
import { currentUser, setCurrentUser } from "../authStore";
import PasswordInput from "../../../components/PasswordInput.vue";

const router = useRouter();
const newPassword = ref("");
const confirmPassword = ref("");
const error = ref("");
const loading = ref(false);

async function handleSubmit() {
  error.value = "";

  if (newPassword.value.length < 8) {
    error.value = "New password must be at least 8 characters.";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = "New password and confirmation do not match.";
    return;
  }

  const username = currentUser.value?.username;
  if (!username) {
    router.push("/login");
    return;
  }

  loading.value = true;
  try {
    await changePassword(newPassword.value);

    try {
      await logout();
    } catch {
      // Harmless if the session was already gone some other way.
    }

    await login(username, newPassword.value);

    const user = await getCurrentUser();
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
          Set a New Password
        </h1>
        <p class="text-black/60 mt-2 text-sm">
          You're signing in with a temporary password. Choose a new one to
          continue.
        </p>
      </div>
      <form
        @submit.prevent="handleSubmit"
        class="bg-white border-2 border-black/10 rounded-lg p-8 space-y-5"
      >
        <PasswordInput
          id="change-password-new"
          label="New password"
          v-model="newPassword"
          autocomplete="new-password"
          :minlength="8"
        />
        <PasswordInput
          id="change-password-confirm"
          label="Confirm new password"
          v-model="confirmPassword"
          autocomplete="new-password"
          :minlength="8"
        />
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-dole-blue text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {{ loading ? "Updating..." : "Update Password" }}
        </button>
      </form>
    </div>
  </div>
</template>
