<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { changePassword, getCurrentUser, ApiError } from "../authService";
import { setCurrentUser } from "../authStore";
import PasswordInput from "../../../components/PasswordInput.vue";

const router = useRouter();
const newPassword = ref("");
const confirmPassword = ref("");
const error = ref("");
const loading = ref(false);

// Live requirement checks — mirrors the backend's actual policy
// (PasswordValidationRules.php: min 12, mixed case, numbers, symbols).
// Client-side check is for immediate feedback only; the server is always
// the source of truth and re-validates independently.
const meetsLength = computed(() => newPassword.value.length >= 12);
const hasUppercase = computed(() => /[A-Z]/.test(newPassword.value));
const hasLowercase = computed(() => /[a-z]/.test(newPassword.value));
const hasNumber = computed(() => /[0-9]/.test(newPassword.value));
const hasSymbol = computed(() => /[^A-Za-z0-9]/.test(newPassword.value));

const allRequirementsMet = computed(
  () =>
    meetsLength.value &&
    hasUppercase.value &&
    hasLowercase.value &&
    hasNumber.value &&
    hasSymbol.value,
);

const passwordsMatch = computed(
  () =>
    confirmPassword.value.length > 0 &&
    newPassword.value === confirmPassword.value,
);

async function handleSubmit() {
  error.value = "";

  if (!allRequirementsMet.value) {
    error.value = "Please meet all password requirements listed below.";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = "New password and confirmation do not match.";
    return;
  }

  loading.value = true;
  try {
    await changePassword(newPassword.value);

    // The backend keeps this session valid through the password change, so
    // there's no logout/log-back-in round-trip. Just re-read the user (the
    // must_change_password flag is now cleared) and let the router guard
    // route on to profile completion or the dashboard.
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
          :minlength="12"
        />

        <ul
          v-if="newPassword"
          class="text-xs space-y-1 -mt-2 bg-black/3 rounded p-3"
        >
          <li :class="meetsLength ? 'text-green-700' : 'text-black/50'">
            {{ meetsLength ? "✓" : "○" }} At least 12 characters
          </li>
          <li
            :class="
              hasUppercase && hasLowercase ? 'text-green-700' : 'text-black/50'
            "
          >
            {{ hasUppercase && hasLowercase ? "✓" : "○" }} Upper and lowercase
            letters
          </li>
          <li :class="hasNumber ? 'text-green-700' : 'text-black/50'">
            {{ hasNumber ? "✓" : "○" }} At least one number
          </li>
          <li :class="hasSymbol ? 'text-green-700' : 'text-black/50'">
            {{ hasSymbol ? "✓" : "○" }} At least one symbol
          </li>
        </ul>

        <PasswordInput
          id="change-password-confirm"
          label="Confirm new password"
          v-model="confirmPassword"
          autocomplete="new-password"
          :minlength="12"
        />
        <p
          v-if="confirmPassword"
          class="text-xs -mt-2"
          :class="passwordsMatch ? 'text-green-700' : 'text-red-600'"
        >
          {{
            passwordsMatch ? "✓ Passwords match" : "✕ Passwords do not match"
          }}
        </p>
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
