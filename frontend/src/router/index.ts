import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import {
  currentUser,
  authChecked,
  setCurrentUser,
} from "../features/auth/authStore";
import { getCurrentUser } from "../features/auth/authService";

//#region ROUTES
const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("../features/auth/views/Login.vue"),
  },
  {
    path: "/change-password",
    name: "change-password",
    component: () => import("../features/auth/views/ChangePassword.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/complete-profile",
    name: "complete-profile",
    component: () => import("../features/auth/views/CompleteProfile.vue"),
    meta: { requiresAuth: true },
  },
  //#endregion

  //#region PROTECTED ROUTES (requires auth)
  {
    path: "/",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: "", redirect: "/home" },
      {
        path: "home",
        name: "home",
        component: () => import("../views/Home.vue"),
      },
      {
        path: "documents",
        name: "documents",
        component: () => import("../features/documents/views/DocumentsHub.vue"),
      },
      {
        path: "monitoring",
        name: "unit-overview",
        component: () =>
          import("../features/monitoring/views/UnitOverview.vue"),
      },
      {
        path: "monitoring/:programId",
        name: "program-periods",
        component: () =>
          import("../features/monitoring/views/ProgramPeriods.vue"),
        props: true,
      },
      {
        path: "documents/:programId/files/:folderPath*",
        name: "file-explorer",
        component: () =>
          import("../features/monitoring/views/FileExplorer.vue"),
        props: true,
      },
      {
        path: "documents/:programId/recycle-bin",
        name: "recycle-bin",
        component: () =>
          import("../features/monitoring/views/RecycleBin.vue"),
        props: true,
      },
      {
        path: "monitoring/:programId/upload",
        name: "upload-entry",
        component: () => import("../features/monitoring/views/UploadEntry.vue"),
        props: true,
      },
      {
        path: "monitoring/:programId/history/:uploadId",
        name: "upload-history-view",
        component: () =>
          import("../features/monitoring/views/UploadHistoryView.vue"),
        props: true,
      },
      {
        path: "monitoring/:programId/:periodId/scope",
        name: "period-scopes",
        component: () =>
          import("../features/monitoring/views/PeriodScopes.vue"),
        props: true,
      },
      {
        path: "monitoring/:programId/:periodId/:scope",
        name: "period-dashboard",
        component: () =>
          import("../features/monitoring/views/PeriodDashboard.vue"),
        props: true,
      },
      {
        path: "users",
        name: "users",
        component: () =>
          import("../features/users/views/CreateStaffAccount.vue"),
        meta: { chiefOnly: true },
      },
      {
        path: "programs",
        name: "programs",
        component: () =>
          import("../features/programs/views/ProgramList.vue"),
      },
      {
        path: "programs/:programCode",
        name: "program-profile",
        component: () =>
          import("../features/programs/views/ProgramProfile.vue"),
        props: true,
      },
      {
        path: "units",
        name: "units",
        component: () => import("../features/units/views/UnitList.vue"),
        meta: { chiefOnly: true },
      },
      {
        path: "reports",
        name: "reports",
        component: () => import("../features/reports/views/ExportCenter.vue"),
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("../views/SettingsPage.vue"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  if (!authChecked.value) {
    const user = await getCurrentUser();
    setCurrentUser(user);
  }

  const user = currentUser.value;
  if (!user) return { path: "/login" };
  if (user.must_change_password) {
    return to.name === "change-password" ? true : { path: "/change-password" };
  }
  if (!user.profile_completed) {
    return to.name === "complete-profile"
      ? true
      : { path: "/complete-profile" };
  }

  // Chief accounts must have 2FA enabled before accessing anything else —
  // Settings is the one place they're allowed to go to set it up.
  if (user.role === "chief" && !user.two_factor_enabled) {
    return to.name === "settings" ? true : { path: "/settings" };
  }

  if (to.name === "change-password" || to.name === "complete-profile") {
    return { path: "/monitoring" };
  }

  if (to.meta.chiefOnly && user.role !== "chief") {
    return { path: "/monitoring" };
  }

  // Staff are scoped to a single program, so the unit-overview picker screen
  // is a pointless extra click for them — send them straight to their own
  // program's periods. Chief oversees every program, so unit-overview stays
  // her landing page. This also covers every OTHER path that lands on
  // "/monitoring" above (post-onboarding, chiefOnly bounce-back) since a
  // redirect re-runs this guard against the new target.
  if (
    to.name === "unit-overview" &&
    user.role === "staff" &&
    user.assigned_program
  ) {
    return {
      name: "program-periods",
      params: { programId: user.assigned_program },
    };
  }

  return true;
});
//#endregion;
export default router;
