import { ref } from "vue";

export interface IdentityVerifyOptions {
  title?: string;
  message?: string;
}

const isOpen = ref(false);
const options = ref<IdentityVerifyOptions>({});
let resolvePromise: ((value: boolean) => void) | null = null;

// Mirrors useConfirm/usePrompt's singleton-modal pattern. Resolves true only
// once the user has completed one of password / passkey / authenticator
// re-verification (see IdentityVerifyDialog.vue) — all three funnel into the
// same backend password.confirm session gate, so any one is sufficient.
export function useIdentityVerify() {
  function verifyIdentity(opts: IdentityVerifyOptions = {}): Promise<boolean> {
    options.value = opts;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }

  function resolveVerify(value: boolean) {
    isOpen.value = false;
    resolvePromise?.(value);
  }

  return { isOpen, options, verifyIdentity, resolveVerify };
}
