import { ref } from "vue";

export interface ToastMessage {
  id: string;
  text: string;
  type: "info" | "success" | "error";
}

const toasts = ref<ToastMessage[]>([]);

export function useToast() {
  function showToast(text: string, type: ToastMessage["type"] = "info") {
    const id = crypto.randomUUID();
    toasts.value.push({ id, text, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3500);
  }
  return { toasts, showToast };
}
