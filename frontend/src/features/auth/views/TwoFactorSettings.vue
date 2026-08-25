<script setup lang="ts">
import { ref, computed } from "vue";
import { getCurrentUser, type CurrentUser } from "../authService";
import {
  confirmPassword,
  enableTwoFactor,
  getTwoFactorQrCode,
  confirmTwoFactor,
  getRecoveryCodes,
  regenerateRecoveryCodes,
  disableTwoFactor,
} from "../data/twoFactorService";
import { useToast } from "../../../composables/useToast";
import { useConfirm } from "../../../composables/useConfirm";
import PasswordInput from "../../../components/PasswordInput.vue";

const { showToast } = useToast();
const { confirmAction } = useConfirm();

type Stage =
  | "loading"
  | "off"
  | "confirming-password"
  | "showing-qr"
  | "on"
  | "showing-recovery-codes";

const stage = ref<Stage>("loading");
const currentUser = ref<CurrentUser | null>(null);
const passwordInput = ref("");
const passwordError = ref("");
const qrSvg = ref("");
const codeInput = ref("");
const codeError = ref("");
const recoveryCodes = ref<string[]>([]);
const busy = ref(false);

async function init() {
  stage.value = "loading";
  currentUser.value = await getCurrentUser();
  stage.value = currentUser.value?.two_factor_enabled ? "on" : "off";
}
init();

function beginEnable() {
  passwordInput.value = "";
  passwordError.value = "";
  stage.value = "confirming-password";
}

async function submitPasswordForEnable() {
  passwordError.value = "";
  busy.value = true;
  try {
    await confirmPassword(passwordInput.value);
    await enableTwoFactor();
    qrSvg.value = await getTwoFactorQrCode();
    codeInput.value = "";
    codeError.value = "";
    stage.value = "showing-qr";
  } catch (err: any) {
    passwordError.value =
      err?.errors?.password?.[0] ?? "Incorrect password. Please try again.";
  } finally {
    busy.value = false;
  }
}

async function submitConfirmCode() {
  codeError.value = "";
  busy.value = true;
  try {
    await confirmTwoFactor(codeInput.value);
    recoveryCodes.value = await getRecoveryCodes();
    stage.value = "showing-recovery-codes";
    showToast("Two-factor authentication enabled.", "success");
  } catch (err: any) {
    codeError.value =
      err?.errors?.code?.[0] ?? "That code didn't match. Please try again.";
  } finally {
    busy.value = false;
  }
}

function finishSetup() {
  stage.value = "on";
}

async function handleDisable() {
  const ok = await confirmAction({
    title: "Disable Two-Factor Authentication",
    message:
      "This will remove the extra sign-in step. Continue only if you're sure.",
    confirmLabel: "Disable",
    danger: true,
  });
  if (!ok) return;

  passwordInput.value = "";
  passwordError.value = "";
  stage.value = "confirming-password";
  disableIntent.value = true;
}

const disableIntent = ref(false);

async function submitPasswordForDisable() {
  passwordError.value = "";
  busy.value = true;
  try {
    await confirmPassword(passwordInput.value);
    await disableTwoFactor();
    disableIntent.value = false;
    stage.value = "off";
    showToast("Two-factor authentication disabled.", "success");
  } catch (err: any) {
    passwordError.value =
      err?.errors?.password?.[0] ?? "Incorrect password. Please try again.";
  } finally {
    busy.value = false;
  }
}

function submitPassword() {
  if (disableIntent.value) return submitPasswordForDisable();
  return submitPasswordForEnable();
}

async function handleRegenerateCodes() {
  const ok = await confirmAction({
    title: "Regenerate Recovery Codes",
    message:
      "Your old recovery codes will stop working. Save the new ones somewhere safe.",
    confirmLabel: "Regenerate",
  });
  if (!ok) return;
  busy.value = true;
  try {
    await regenerateRecoveryCodes();
    recoveryCodes.value = await getRecoveryCodes();
    stage.value = "showing-recovery-codes";
    showToast("Recovery codes regenerated.", "success");
  } catch {
    showToast("Could not regenerate codes. Please try again.", "error");
  } finally {
    busy.value = false;
  }
}

const passwordStageTitle = computed(() =>
  disableIntent.value
    ? "Confirm your password to disable 2FA"
    : "Confirm your password to continue",
);
</script>

<template>
  <div class="bg-white border border-black/10 rounded-lg p-6 max-w-lg">
    <h2 class="font-display text-lg font-semibold text-dole-blue mb-1">
      Two-Factor Authentication
    </h2>
    <p class="text-sm text-black/60 mb-4">
      Add an extra step to your sign-in using an authenticator app.
    </p>

    <div v-if="stage === 'loading'" class="text-sm text-black/50">Loading…</div>

    <div v-else-if="stage === 'off'">
      <p class="text-sm text-black/60 mb-4">
        Two-factor authentication is currently <strong>off</strong>.
      </p>
      <button
        @click="beginEnable"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
      >
        Enable Two-Factor Authentication
      </button>
    </div>

    <div v-else-if="stage === 'confirming-password'">
      <PasswordInput
        id="tfa-password"
        :label="passwordStageTitle"
        v-model="passwordInput"
        @keyup.enter="submitPassword"
      />
      <p v-if="passwordError" class="text-xs text-dole-red mb-2">
        {{ passwordError }}
      </p>
      <div class="flex gap-3 mt-3">
        <button
          @click="submitPassword"
          :disabled="busy"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ busy ? "Checking…" : "Continue" }}
        </button>
        <button
          @click="
            stage = disableIntent ? 'on' : 'off';
            disableIntent = false;
          "
          class="text-sm text-black/60 hover:text-black"
        >
          Cancel
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'showing-qr'">
      <p class="text-sm text-black/60 mb-3">
        Scan this with your authenticator app (Google Authenticator, Authy,
        etc.), then enter the 6-digit code it shows.
      </p>
      <div
        class="border border-black/10 rounded p-3 mb-3 inline-block"
        v-html="qrSvg"
      />
      <label for="tfa-code" class="block text-sm font-medium text-black/70 mb-1"
        >6-digit code</label
      >
      <input
        id="tfa-code"
        v-model="codeInput"
        type="text"
        inputmode="numeric"
        maxlength="6"
        class="w-full border border-black/20 rounded px-3 py-2 mb-1"
        @keyup.enter="submitConfirmCode"
      />
      <p v-if="codeError" class="text-xs text-dole-red mb-2">
        {{ codeError }}
      </p>
      <button
        @click="submitConfirmCode"
        :disabled="busy"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50 mt-2"
      >
        {{ busy ? "Confirming…" : "Confirm" }}
      </button>
    </div>

    <div v-else-if="stage === 'showing-recovery-codes'">
      <p class="text-sm text-black/70 mb-3">
        Save these recovery codes somewhere safe. Each can be used once if you
        lose access to your authenticator app.
      </p>
      <div
        class="bg-paper border border-black/10 rounded p-3 mb-4 font-mono text-sm space-y-1"
      >
        <div v-for="c in recoveryCodes" :key="c">{{ c }}</div>
      </div>
      <button
        @click="finishSetup"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
      >
        Done
      </button>
    </div>

    <div v-else-if="stage === 'on'">
      <p class="text-sm text-black/60 mb-4">
        Two-factor authentication is currently
        <strong class="text-dole-blue">on</strong>.
      </p>
      <div class="flex gap-3">
        <button
          @click="handleRegenerateCodes"
          :disabled="busy"
          class="border border-dole-blue text-dole-blue text-sm px-4 py-2 rounded hover:bg-dole-blue/5 transition disabled:opacity-50"
        >
          Regenerate Recovery Codes
        </button>
        <button
          @click="handleDisable"
          class="text-dole-red text-sm px-4 py-2 hover:underline"
        >
          Disable
        </button>
      </div>
    </div>
  </div>
</template>
