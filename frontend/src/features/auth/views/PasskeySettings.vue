<script setup lang="ts">
import { ref } from "vue";
import {
  getPasskeys,
  registerPasskey,
  deletePasskey,
  isPasskeySupported,
  type PasskeyRecord,
} from "../data/passkeyService";
import { confirmPassword } from "../data/twoFactorService";
import { useToast } from "../../../composables/useToast";
import { useConfirm } from "../../../composables/useConfirm";
import { usePrompt } from "../../../composables/usePrompt";
import PasswordInput from "../../../components/PasswordInput.vue";

const { showToast } = useToast();
const { confirmAction } = useConfirm();
const { promptAction } = usePrompt();

type Stage = "loading" | "list" | "confirming-password";

const stage = ref<Stage>("loading");
const passkeys = ref<PasskeyRecord[]>([]);
const passwordInput = ref("");
const passwordError = ref("");
const busy = ref(false);
const supported = isPasskeySupported();

async function loadPasskeys() {
  passkeys.value = await getPasskeys();
}

async function init() {
  stage.value = "loading";
  await loadPasskeys();
  stage.value = "list";
}
init();

function formatDate(iso: string | null): string {
  if (!iso) return "Never used";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;

  let os = "Unknown Device";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) os = "Mac";
  else if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

async function beginAddPasskey() {
  const name = await promptAction({
    title: "Name This Passkey",
    placeholder: "e.g. My Laptop, Office PC",
    defaultValue: guessDeviceName(),
    confirmLabel: "Continue",
  });
  if (!name) return;
  pendingName.value = name;
  passwordInput.value = "";
  passwordError.value = "";
  stage.value = "confirming-password";
}

const pendingName = ref("");

async function submitPasswordAndRegister() {
  passwordError.value = "";
  busy.value = true;
  try {
    await confirmPassword(passwordInput.value);
    await registerPasskey(pendingName.value);
    await loadPasskeys();
    stage.value = "list";
    showToast("Passkey added.", "success");
  } catch (err: any) {
    if (err?.errors?.password) {
      passwordError.value = err.errors.password[0];
    } else {
      // WebAuthn cancellation, unsupported browser, or a real server error
      // — surface it and drop back to the list rather than get stuck.
      showToast(
        err instanceof Error ? err.message : "Could not add passkey.",
        "error",
      );
      stage.value = "list";
    }
  } finally {
    busy.value = false;
  }
}

async function handleDelete(passkey: PasskeyRecord) {
  const ok = await confirmAction({
    title: "Remove Passkey",
    message: `Remove "${passkey.name}"? You won't be able to sign in with this device's passkey anymore.`,
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return;
  try {
    await deletePasskey(passkey.id);
    await loadPasskeys();
    showToast("Passkey removed.", "success");
  } catch {
    showToast("Could not remove this passkey. Please try again.", "error");
  }
}
</script>

<template>
  <div class="bg-white border border-black/10 rounded-lg p-6 max-w-lg">
    <h2 class="font-display text-lg font-semibold text-dole-blue mb-1">
      Passkeys
    </h2>
    <p class="text-sm text-black/60 mb-4">
      Sign in using your device's fingerprint, face, or PIN instead of typing a
      password.
    </p>

    <p v-if="!supported" class="text-sm text-dole-red mb-4">
      Your browser doesn't support passkeys. Try a recent version of Chrome,
      Edge, or Safari.
    </p>

    <template v-else>
      <div v-if="stage === 'loading'" class="text-sm text-black/50">
        Loading…
      </div>

      <div v-else-if="stage === 'confirming-password'">
        <PasswordInput
          id="passkey-password"
          label="Confirm your password to continue"
          v-model="passwordInput"
          @keyup.enter="submitPasswordAndRegister"
        />
        <p v-if="passwordError" class="text-xs text-dole-red mb-2">
          {{ passwordError }}
        </p>
        <div class="flex gap-3 mt-3">
          <button
            @click="submitPasswordAndRegister"
            :disabled="busy"
            class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
          >
            {{ busy ? "Setting up…" : "Continue" }}
          </button>
          <button
            @click="stage = 'list'"
            class="text-sm text-black/60 hover:text-black"
          >
            Cancel
          </button>
        </div>
      </div>

      <div v-else-if="stage === 'list'">
        <p v-if="passkeys.length === 0" class="text-sm text-black/50 mb-4">
          No passkeys registered yet.
        </p>
        <div v-else class="space-y-2 mb-4">
          <div
            v-for="pk in passkeys"
            :key="pk.id"
            class="flex justify-between items-center border border-black/10 rounded p-3"
          >
            <div>
              <p class="text-sm font-medium">{{ pk.name }}</p>
              <p class="text-xs text-black/50">
                Added {{ formatDate(pk.created_at) }} • Last used
                {{ formatDate(pk.last_used_at) }}
              </p>
            </div>
            <button
              @click="handleDelete(pk)"
              class="text-xs text-dole-red hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
        <button
          @click="beginAddPasskey"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          + Add a Passkey
        </button>
      </div>
    </template>
  </div>
</template>
