import { computed } from "vue";
import { currentUser } from "../auth/authStore";

export type PortalRole = "staff" | "chief";

// Derived directly from the authenticated user — no more separate mock
// state, no more manual setRole()/setAssignedProgram() calls scattered
// across Login.vue/ChangePassword.vue/CompleteProfile.vue. Whenever
// authStore.currentUser changes (login, logout, onboarding completing),
// these update automatically — there's no way for them to drift out of
// sync with the real authenticated user anymore.
export const currentRole = computed<PortalRole>(
  () => currentUser.value?.role ?? "staff",
);

export const assignedProgram = computed<string>(
  () => currentUser.value?.assigned_program ?? "",
);
