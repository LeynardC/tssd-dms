import { ref } from "vue";

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

const isOpen = ref(false);
const options = ref<PromptOptions>({ title: "" });
const inputValue = ref("");
let resolvePromise: ((value: string | null) => void) | null = null;

export function usePrompt() {
  function promptAction(opts: PromptOptions): Promise<string | null> {
    options.value = opts;
    inputValue.value = opts.defaultValue ?? "";
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }

  function handleConfirm() {
    isOpen.value = false;
    resolvePromise?.(inputValue.value.trim() || null);
  }

  function handleCancel() {
    isOpen.value = false;
    resolvePromise?.(null);
  }

  return {
    isOpen,
    options,
    inputValue,
    promptAction,
    handleConfirm,
    handleCancel,
  };
}
