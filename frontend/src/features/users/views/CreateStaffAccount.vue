<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  createStaffAccount,
  getStaffList,
  toggleStaffActive,
  resetStaffPassword,
  updateStaffProfile,
  deleteStaffAccount,
  ApiError,
  type StaffMember,
} from "../../auth/authService";
import { UNITS, PROGRAMS_BY_UNIT } from "../../auth/unitsAndPrograms";
import { useConfirm } from "../../../composables/useConfirm";
import { useToast } from "../../../composables/useToast";
import Modal from "../../../components/Modal.vue";

const { confirmAction } = useConfirm();
const { showToast } = useToast();
const showCreateModal = ref(false);

// --- Create form ---
const name = ref("");
const username = ref("");
const staffId = ref("");
const createError = ref("");
const creating = ref(false);

const createdUser = ref<{ username: string; staff_id: string } | null>(null);
const tempPassword = ref("");
const copied = ref(false);

async function handleCreate() {
  createError.value = "";
  creating.value = true;
  try {
    const result = await createStaffAccount({
      name: name.value.trim(),
      username: username.value.trim().toLowerCase(),
      staff_id: staffId.value.trim(),
    });
    showCreateModal.value = false; // close the form before the reveal shows
    createdUser.value = {
      username: result.user.username,
      staff_id: result.user.staff_id,
    };
    tempPassword.value = result.temp_password;
    copied.value = false;
    name.value = "";
    username.value = "";
    staffId.value = "";
    await loadStaff();
  } catch (err) {
    createError.value =
      err instanceof ApiError
        ? err.errors
          ? Object.values(err.errors).flat().join(" ")
          : err.message
        : "Something went wrong. Please try again.";
  } finally {
    creating.value = false;
  }
}

function openCreateModal() {
  createError.value = "";
  showCreateModal.value = true;
}

async function copyPassword() {
  await navigator.clipboard.writeText(tempPassword.value);
  copied.value = true;
}

function dismissReveal() {
  createdUser.value = null;
  tempPassword.value = "";
  copied.value = false;
}

// --- Staff table ---
const staff = ref<StaffMember[]>([]);
const loadingStaff = ref(true);
const listError = ref("");

async function loadStaff() {
  loadingStaff.value = true;
  listError.value = "";
  try {
    staff.value = await getStaffList();
  } catch (err) {
    listError.value =
      err instanceof ApiError ? err.message : "Could not load staff list.";
  } finally {
    loadingStaff.value = false;
  }
}

onMounted(loadStaff);

function programLabel(programValue: string | null): string {
  if (!programValue) return "—";
  for (const list of Object.values(PROGRAMS_BY_UNIT)) {
    const match = list.find((p) => p.value === programValue);
    if (match) return match.label;
  }
  return programValue;
}

function unitLabel(unitValue: string | null): string {
  return UNITS.find((u) => u.value === unitValue)?.label ?? "—";
}

function onboardingStatus(member: StaffMember): string {
  if (member.must_change_password) return "Pending: password change";
  if (!member.profile_completed) return "Pending: profile setup";
  return "Onboarded";
}

// --- Kebab menu: fixed-position overlay, teleported to <body> ---
const openMenuMember = ref<StaffMember | null>(null);
const menuPosition = ref({ top: 0, left: 0 });
const activeButtonEl = ref<HTMLElement | null>(null);

const MENU_WIDTH = 176;
const MENU_HEIGHT_ESTIMATE = 200;
const VIEWPORT_MARGIN = 8;

function computePosition(button: HTMLElement) {
  const rect = button.getBoundingClientRect();

  let left = rect.right - MENU_WIDTH;
  left = Math.max(VIEWPORT_MARGIN, left);
  left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);

  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow >= MENU_HEIGHT_ESTIMATE
      ? rect.bottom + 4
      : rect.top - MENU_HEIGHT_ESTIMATE - 4;

  return { top: Math.max(VIEWPORT_MARGIN, top), left };
}

function toggleMenu(member: StaffMember, event: MouseEvent) {
  if (openMenuMember.value?.id === member.id) {
    closeMenu();
    return;
  }
  const button = event.currentTarget as HTMLElement;
  activeButtonEl.value = button;
  menuPosition.value = computePosition(button);
  openMenuMember.value = member;
}

function closeMenu() {
  openMenuMember.value = null;
  activeButtonEl.value = null;
}

// A floating menu should track its anchor button as the page (or the
// table's own scroll container) scrolls — not just disappear. Only close
// it automatically if the button has scrolled fully out of view, since a
// menu with no visible anchor point looks disconnected and confusing.
function handleReposition() {
  if (!activeButtonEl.value) return;
  const rect = activeButtonEl.value.getBoundingClientRect();
  const fullyOffscreen =
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth;
  if (fullyOffscreen) {
    closeMenu();
    return;
  }
  menuPosition.value = computePosition(activeButtonEl.value);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeMenu();
}

function menuEdit(member: StaffMember) {
  closeMenu();
  openEdit(member);
}
function menuResetPassword(member: StaffMember) {
  closeMenu();
  handleResetPassword(member);
}
function menuToggleActive(member: StaffMember) {
  closeMenu();
  handleToggleActive(member);
}
function menuDelete(member: StaffMember) {
  closeMenu();
  handleDelete(member);
}

onMounted(() => {
  window.addEventListener("click", closeMenu);
  window.addEventListener("scroll", handleReposition, true);
  window.addEventListener("resize", handleReposition);
  window.addEventListener("keydown", handleKeydown);
});
onUnmounted(() => {
  window.removeEventListener("click", closeMenu);
  window.removeEventListener("scroll", handleReposition, true);
  window.removeEventListener("resize", handleReposition);
  window.removeEventListener("keydown", handleKeydown);
});

// --- Row actions: toggle active ---
async function handleToggleActive(member: StaffMember) {
  const goingInactive = member.is_active;
  const ok = await confirmAction({
    title: goingInactive ? "Deactivate Account" : "Reactivate Account",
    message: goingInactive
      ? `Deactivate ${member.name}? They will not be able to log in until reactivated.`
      : `Reactivate ${member.name}? They will be able to log in again.`,
    confirmLabel: goingInactive ? "Deactivate" : "Reactivate",
    danger: goingInactive,
  });
  if (!ok) return;
  try {
    await toggleStaffActive(member.id);
    showToast(
      goingInactive
        ? `${member.name} deactivated.`
        : `${member.name} reactivated.`,
      "success",
    );
    await loadStaff();
  } catch (err) {
    showToast(
      err instanceof ApiError ? err.message : "Could not update account.",
      "error",
    );
  }
}

// --- Row actions: reset password ---
const resetTarget = ref<StaffMember | null>(null);
const resetTempPassword = ref("");
const resetCopied = ref(false);

async function handleResetPassword(member: StaffMember) {
  const ok = await confirmAction({
    title: "Reset Password",
    message: `Generate a new temporary password for ${member.name}? Their current password will stop working immediately.`,
    confirmLabel: "Reset Password",
    danger: true,
  });
  if (!ok) return;
  try {
    const result = await resetStaffPassword(member.id);
    resetTarget.value = result.user;
    resetTempPassword.value = result.temp_password;
    resetCopied.value = false;
    await loadStaff();
  } catch (err) {
    showToast(
      err instanceof ApiError ? err.message : "Could not reset password.",
      "error",
    );
  }
}

async function copyResetPassword() {
  await navigator.clipboard.writeText(resetTempPassword.value);
  resetCopied.value = true;
}

function dismissReset() {
  resetTarget.value = null;
  resetTempPassword.value = "";
  resetCopied.value = false;
}

// --- Row actions: edit position/unit/program ---
const editTarget = ref<StaffMember | null>(null);
const editPosition = ref("");
const editUnit = ref("");
const editProgram = ref("");
const editError = ref("");
const editSaving = ref(false);

const editAvailablePrograms = computed(
  () => PROGRAMS_BY_UNIT[editUnit.value] ?? [],
);

function openEdit(member: StaffMember) {
  editTarget.value = member;
  editPosition.value = member.position ?? "";
  editUnit.value = member.unit ?? "";
  editProgram.value = member.assigned_program ?? "";
  editError.value = "";
}

function handleEditUnitChange() {
  editProgram.value = "";
}

async function saveEdit() {
  if (!editTarget.value) return;
  editError.value = "";
  editSaving.value = true;
  try {
    await updateStaffProfile(editTarget.value.id, {
      position: editPosition.value.trim(),
      unit: editUnit.value,
      assigned_program: editProgram.value,
    });
    showToast("Staff details updated.", "success");
    editTarget.value = null;
    await loadStaff();
  } catch (err) {
    editError.value =
      err instanceof ApiError
        ? err.errors
          ? Object.values(err.errors).flat().join(" ")
          : err.message
        : "Could not save changes.";
  } finally {
    editSaving.value = false;
  }
}

// --- Details (read-only) ---
const detailsTarget = ref<StaffMember | null>(null);

// --- Row actions: delete ---
async function handleDelete(member: StaffMember) {
  const ok = await confirmAction({
    title: "Delete Staff Account",
    message: `Permanently delete ${member.name}'s account? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteStaffAccount(member.id);
    showToast(`${member.name}'s account deleted.`, "success");
    await loadStaff();
  } catch (err) {
    showToast(
      err instanceof ApiError ? err.message : "Could not delete account.",
      "error",
    );
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <h1 class="font-display text-2xl font-semibold">Users & Roles</h1>
      <p class="text-white/80 text-sm mt-1">
        Create and manage staff accounts. Chief-only.
      </p>
    </header>

    <main class="max-w-5xl mx-auto px-8 py-10 space-y-8">
      <!-- Create form -->
      <!-- Staff Accounts header now includes the Create trigger -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display text-lg font-semibold text-dole-blue">
          Staff Accounts
        </h2>
        <button
          @click="openCreateModal"
          class="bg-dole-blue text-white rounded px-4 py-2 text-sm font-medium"
        >
          + Create Staff Account
        </button>
      </div>
      <Modal
        v-if="showCreateModal"
        title="Create Staff Account"
        @close="showCreateModal = false"
      >
        <form @submit.prevent="handleCreate" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-black/70 mb-1"
              >Full name</label
            >
            <input
              v-model="name"
              type="text"
              required
              class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-black/70 mb-1"
              >Username</label
            >
            <input
              v-model="username"
              type="text"
              required
              placeholder="e.g. juan.delacruz"
              class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-black/70 mb-1"
              >Staff ID</label
            >
            <input
              v-model="staffId"
              type="text"
              required
              placeholder="e.g. STAFF-014"
              class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
            />
          </div>
          <p v-if="createError" class="text-sm text-red-600">
            {{ createError }}
          </p>
        </form>
        <template #footer>
          <button
            @click="showCreateModal = false"
            class="text-sm text-black/60 px-4 py-2 hover:text-black"
          >
            Cancel
          </button>
          <button
            @click="handleCreate"
            :disabled="creating"
            class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
          >
            {{ creating ? "Creating..." : "Create Account" }}
          </button>
        </template>
      </Modal>
      <!-- Staff table -->
      <div class="bg-white border border-black/10 rounded-lg p-6">
        <h2 class="font-display text-lg font-semibold text-dole-blue mb-4">
          Staff Accounts
        </h2>

        <p v-if="loadingStaff" class="text-sm text-black/50">Loading...</p>
        <p v-else-if="listError" class="text-sm text-red-600">
          {{ listError }}
        </p>
        <p v-else-if="staff.length === 0" class="text-sm text-black/50">
          No staff accounts yet. Create one above.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-black/50 border-b border-black/10">
                <th class="pb-2 pr-3">Name</th>
                <th class="pb-2 pr-3">Username</th>
                <th class="pb-2 pr-3">Unit / Program</th>
                <th class="pb-2 pr-3">Status</th>
                <th class="pb-2 pr-3">Onboarding</th>
                <th class="pb-2 pr-3">View</th>
                <th class="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="member in staff"
                :key="member.id"
                class="border-b border-black/5 last:border-0 transition-colors"
                :class="member.is_active ? '' : 'bg-red-50/40 text-black/40'"
              >
                <td class="py-2 pr-3 font-medium">{{ member.name }}</td>
                <td class="py-2 pr-3 text-black/70">{{ member.username }}</td>
                <td class="py-2 pr-3 text-black/70">
                  {{ unitLabel(member.unit) }} /
                  {{ programLabel(member.assigned_program) }}
                </td>
                <td class="py-2 pr-3">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="
                      member.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    "
                  >
                    {{ member.is_active ? "Active" : "Inactive" }}
                  </span>
                </td>
                <td class="py-2 pr-3 text-xs text-black/50">
                  {{ onboardingStatus(member) }}
                </td>
                <td class="py-2 pr-3">
                  <button
                    @click="detailsTarget = member"
                    class="text-xs text-dole-blue hover:underline"
                  >
                    View
                  </button>
                </td>
                <td class="py-2 text-right">
                  <button
                    @click.stop="toggleMenu(member, $event)"
                    class="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-black/5 text-black/50 hover:text-black text-lg leading-none"
                    aria-label="Actions"
                  >
                    ⋮
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Row action dropdown — fixed-position overlay, positioned by click
         coordinates, so it's never clipped or scrolled by the table. -->
    <Teleport to="body">
      <div
        v-if="openMenuMember"
        @click.stop
        class="fixed bg-white border border-black/10 rounded-lg shadow-lg z-50 py-1 w-44"
        :style="{
          top: menuPosition.top + 'px',
          left: menuPosition.left + 'px',
        }"
      >
        <button
          @click="menuEdit(openMenuMember)"
          class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
        >
          Edit
        </button>
        <button
          @click="menuResetPassword(openMenuMember)"
          class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
        >
          Reset Password
        </button>
        <button
          @click="menuToggleActive(openMenuMember)"
          class="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
        >
          {{ openMenuMember.is_active ? "Deactivate" : "Reactivate" }}
        </button>
        <div class="border-t border-black/10 my-1"></div>
        <button
          @click="menuDelete(openMenuMember)"
          class="w-full text-left px-3 py-2 text-sm text-dole-red hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </Teleport>

    <!-- Create: one-time temp password reveal -->
    <div
      v-if="createdUser"
      class="fixed inset-0 bg-black/40 flex items-center justify-center px-8 z-50"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 class="font-display text-lg font-semibold text-dole-blue mb-2">
          Account Created
        </h3>
        <p class="text-sm text-black/70 mb-4">
          Give these credentials to
          <strong>{{ createdUser.username }}</strong> ({{
            createdUser.staff_id
          }}). This password will not be shown again — copy it now.
        </p>
        <div
          class="bg-black/5 rounded p-3 font-mono text-sm flex items-center justify-between gap-2 mb-2"
        >
          <span>{{ tempPassword }}</span>
          <button
            @click="copyPassword"
            class="text-xs text-dole-blue underline shrink-0"
          >
            {{ copied ? "Copied!" : "Copy" }}
          </button>
        </div>
        <p class="text-xs text-black/50 mb-4">
          They'll be required to set a new password and complete their profile
          on first login.
        </p>
        <button
          @click="dismissReveal"
          class="w-full bg-dole-blue text-white rounded py-2 text-sm font-medium"
        >
          Done
        </button>
      </div>
    </div>

    <!-- Reset password: one-time reveal -->
    <div
      v-if="resetTarget"
      class="fixed inset-0 bg-black/40 flex items-center justify-center px-8 z-50"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 class="font-display text-lg font-semibold text-dole-blue mb-2">
          Password Reset
        </h3>
        <p class="text-sm text-black/70 mb-4">
          New temporary password for <strong>{{ resetTarget.name }}</strong
          >. This will not be shown again — copy it now.
        </p>
        <div
          class="bg-black/5 rounded p-3 font-mono text-sm flex items-center justify-between gap-2 mb-2"
        >
          <span>{{ resetTempPassword }}</span>
          <button
            @click="copyResetPassword"
            class="text-xs text-dole-blue underline shrink-0"
          >
            {{ resetCopied ? "Copied!" : "Copy" }}
          </button>
        </div>
        <p class="text-xs text-black/50 mb-4">
          They'll be required to set a new password on next login.
        </p>
        <button
          @click="dismissReset"
          class="w-full bg-dole-blue text-white rounded py-2 text-sm font-medium"
        >
          Done
        </button>
      </div>
    </div>

    <!-- Edit modal -->
    <Modal
      v-if="editTarget"
      title="Edit Staff Details"
      @close="editTarget = null"
    >
      <form @submit.prevent="saveEdit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-black/70 mb-1"
            >Position</label
          >
          <input
            v-model="editPosition"
            type="text"
            required
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-black/70 mb-1"
            >Unit</label
          >
          <select
            v-model="editUnit"
            @change="handleEditUnitChange"
            required
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          >
            <option value="" disabled>Select a unit</option>
            <option v-for="u in UNITS" :key="u.value" :value="u.value">
              {{ u.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-black/70 mb-1"
            >Assigned Program</label
          >
          <select
            v-model="editProgram"
            required
            :disabled="!editUnit"
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue disabled:bg-black/5"
          >
            <option value="" disabled>
              {{ editUnit ? "Select a program" : "Select a unit first" }}
            </option>
            <option
              v-for="p in editAvailablePrograms"
              :key="p.value"
              :value="p.value"
            >
              {{ p.label }}
            </option>
          </select>
        </div>
        <p v-if="editError" class="text-sm text-red-600">{{ editError }}</p>
      </form>
      <template #footer>
        <button
          @click="editTarget = null"
          class="text-sm text-black/60 px-4 py-2 hover:text-black"
        >
          Cancel
        </button>
        <button
          @click="saveEdit"
          :disabled="editSaving"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition disabled:opacity-50"
        >
          {{ editSaving ? "Saving..." : "Save Changes" }}
        </button>
      </template>
    </Modal>

    <!-- Details modal (read-only) -->
    <Modal
      v-if="detailsTarget"
      :title="detailsTarget.name"
      @close="detailsTarget = null"
    >
      <dl class="text-sm space-y-2">
        <div class="flex justify-between">
          <dt class="text-black/50">Username</dt>
          <dd>{{ detailsTarget.username }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Staff ID</dt>
          <dd>{{ detailsTarget.staff_id }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Position</dt>
          <dd>{{ detailsTarget.position ?? "—" }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Unit</dt>
          <dd>{{ unitLabel(detailsTarget.unit) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Assigned Program</dt>
          <dd>{{ programLabel(detailsTarget.assigned_program) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Status</dt>
          <dd>{{ detailsTarget.is_active ? "Active" : "Inactive" }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Onboarding</dt>
          <dd>{{ onboardingStatus(detailsTarget) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-black/50">Created</dt>
          <dd>{{ new Date(detailsTarget.created_at).toLocaleDateString() }}</dd>
        </div>
      </dl>
      <template #footer>
        <button
          @click="detailsTarget = null"
          class="bg-dole-blue text-white text-sm px-4 py-2 rounded hover:bg-dole-blue-dark transition"
        >
          Close
        </button>
      </template>
    </Modal>
  </div>
</template>
