import { ref } from "vue";
import type { CurrentUser } from "./authService";

export const currentUser = ref<CurrentUser | null>(null);
export const authChecked = ref(false);

export function setCurrentUser(user: CurrentUser | null) {
  currentUser.value = user;
  authChecked.value = true;
}
