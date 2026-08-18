import { ref } from "vue";

export interface ConfirmOptions {
  title: string;
  message: string;
  items?: string[]; // optional bulleted list, rendered below the message
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // true = red confirm button, for destructive actions
}

const isOpen = ref(false);
const options = ref<ConfirmOptions>({ title: "", message: "" });
let resolvePromise: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function confirmAction(opts: ConfirmOptions): Promise<boolean> {
    options.value = opts;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }

  function handleConfirm() {
    isOpen.value = false;
    resolvePromise?.(true);
  }

  function handleCancel() {
    isOpen.value = false;
    resolvePromise?.(false);
  }

  return { isOpen, options, confirmAction, handleConfirm, handleCancel };
}
