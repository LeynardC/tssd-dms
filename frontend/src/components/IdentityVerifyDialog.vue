<script setup lang="ts">
import { ref, watch } from "vue";
import { useIdentityVerify } from "../composables/useIdentityVerify";
import { getCurrentUser } from "../features/auth/authService";
import {
  confirmPassword,
  confirmTwoFactorCode,
} from "../features/auth/data/twoFactorService";
import {
  confirmPasskey,
  getPasskeys,
  isPasskeySupported,
} from "../features/auth/data/passkeyService";
import Modal from "./Modal.vue";
import PasswordInput from "./PasswordInput.vue";

const { isOpen, options, resolveVerify } = useIdentityVerify();

type Method = "password" | "authenticator" | "passkey";

const availableMethods = ref<Method[]>(["password"]);
const method = ref<Method>("password");
const passwordInput = ref("");
const codeInput = ref("");
const error = ref("");
const busy = ref(false);

watch(isOpen, async (open) => {
  if (!open) return;
  passwordInput.value = "";
  codeInput.value = "";
  error.value = "";
  busy.value = false;
  method.value = "password";
  availableMethods.value = ["password"];

  const [user, passkeys] = await Promise.all([
    getCurrentUser(),
    isPasskeySupported() ? getPasskeys().catch(() => []) : Promise.resolve([]),
  ]);
  if (user?.two_factor_enabled) availableMethods.value.push("authenticator");
  if (passkeys.length > 0) availableMethods.value.push("passkey");
});

function switchMethod(m: Method) {
  method.value = m;
  error.value = "";
}

function close() {
  resolveVerify(false);
}

async function submitPassword() {
  error.value = "";
  busy.value = true;
  try {
    await confirmPassword(passwordInput.value);
    resolveVerify(true);
  } catch (err: any) {
    error.value =
      err?.errors?.password?.[0] ?? "Incorrect password. Please try again.";
  } finally {
    busy.value = false;
  }
}

async function submitCode() {
  error.value = "";
  busy.value = true;
  try {
    await confirmTwoFactorCode(codeInput.value);
    resolveVerify(true);
  } catch (err: any) {
    error.value =
      err?.errors?.code?.[0] ?? "That code didn't match. Please try again.";
  } finally {
    busy.value = false;
  }
}

async function submitPasskey() {
  error.value = "";
  busy.value = true;
  try {
    await confirmPasskey();
    resolveVerify(true);
  } catch (err: any) {
    error.value = err?.message ?? "Passkey verification failed.";
  } finally {
    busy.value = false;
  }
}

const methodLabels: Record<Method, string> = {
  password: "Password",
  authenticator: "Authenticator",
  passkey: "Passkey",
};
</script>

<template>
  <Modal
    v-if="isOpen"
    :title="options.title ?? 'Verify your identity'"
    @close="close"
  >
    <p class="text-sm text-black/70 mb-4">
      {{ options.message ?? "This action needs to confirm it's really you." }}
    </p>

    <div
      v-if="availableMethods.length > 1"
      class="flex border border-black/10 rounded overflow-hidden mb-4 w-fit"
    >
      <button
        v-for="m in availableMethods"
        :key="m"
        @click="switchMethod(m)"
        class="px-3 py-1.5 text-xs"
        :class="
          method === m ? 'bg-dole-blue text-white' : 'bg-white text-black/60'
        "
      >
        {{ methodLabels[m] }}
      </button>
    </div>

    <div v-if="method === 'password'">
      <PasswordInput
        id="identity-verify-password"
        label="Password"
        v-model="passwordInput"
        @keyup.enter="submitPassword"
      />
      <p v-if="error" class="text-xs text-dole-red mt-2">{{ error }}</p>
      <button
        @click="submitPassword"
        :disabled="busy || !passwordInput"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50 mt-3"
      >
        {{ busy ? "Checking…" : "Confirm" }}
      </button>
    </div>

    <div v-else-if="method === 'authenticator'">
      <label
        for="identity-verify-code"
        class="block text-sm font-medium text-black/70 mb-1"
        >6-digit code</label
      >
      <input
        id="identity-verify-code"
        v-model="codeInput"
        type="text"
        inputmode="numeric"
        maxlength="6"
        class="w-full border border-black/20 rounded px-3 py-2"
        @keyup.enter="submitCode"
      />
      <p v-if="error" class="text-xs text-dole-red mt-2">{{ error }}</p>
      <button
        @click="submitCode"
        :disabled="busy || !codeInput"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50 mt-3"
      >
        {{ busy ? "Checking…" : "Confirm" }}
      </button>
    </div>

    <div v-else-if="method === 'passkey'">
      <p class="text-sm text-black/60 mb-3">
        Your browser will prompt you to use your passkey.
      </p>
      <p v-if="error" class="text-xs text-dole-red mb-2">{{ error }}</p>
      <button
        @click="submitPasskey"
        :disabled="busy"
        class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
      >
        {{ busy ? "Waiting…" : "Use Passkey" }}
      </button>
    </div>

    <template #footer>
      <button
        @click="close"
        class="text-sm text-black/60 px-4 py-2 hover:text-black"
      >
        Cancel
      </button>
    </template>
  </Modal>
</template>
