<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { completeProfile, ApiError } from "../authService";
import { setCurrentUser } from "../authStore";
import {
  ensureCategoriesLoaded,
  UNITS,
  programsByUnit,
  categoriesLoading,
} from "../../categories/data/categoryCache";

const router = useRouter();
const position = ref("");
const unit = ref("");
const assignedProgram = ref("");
const error = ref("");
const loading = ref(false);

const availablePrograms = computed(
  () => programsByUnit.value[unit.value] ?? [],
);
onMounted(ensureCategoriesLoaded);
// Reset the program choice whenever unit changes, so a stale selection from
// a different unit can't silently get submitted alongside a new unit.
function handleUnitChange() {
  assignedProgram.value = "";
}

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    const user = await completeProfile({
      position: position.value.trim(),
      unit: unit.value,
      assigned_program: assignedProgram.value,
    });
    setCurrentUser(user);
    router.push("/monitoring");
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.errors
          ? Object.values(err.errors).flat().join(" ")
          : err.message
        : "Something went wrong. Please try again.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper flex items-center justify-center px-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-10">
        <p class="text-sm tracking-wide text-dole-blue/70 uppercase">
          DOLE MIMAROPA — TSSD
        </p>
        <h1 class="font-display text-3xl font-semibold text-dole-blue mt-2">
          Complete Your Profile
        </h1>
        <p class="text-black/60 mt-2 text-sm">
          Tell us your position, unit, and assigned program before continuing.
        </p>
      </div>
      <form
        @submit.prevent="handleSubmit"
        class="bg-white border-2 border-black/10 rounded-lg p-8 space-y-5"
      >
        <div>
          <label
            for="complete-profile-position"
            class="block text-sm font-medium text-black/70 mb-1"
            >Position</label
          >
          <input
            id="complete-profile-position"
            v-model="position"
            type="text"
            required
            placeholder="e.g. GIP Intern"
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue"
          />
        </div>
        <div>
          <label
            for="complete-profile-unit"
            class="block text-sm font-medium text-black/70 mb-1"
            >Unit</label
          >
          <select
            id="complete-profile-unit"
            v-model="unit"
            @change="handleUnitChange"
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
          <label
            for="complete-profile-program"
            class="block text-sm font-medium text-black/70 mb-1"
            >Assigned Program</label
          >
          <select
            id="complete-profile-program"
            v-model="assignedProgram"
            required
            :disabled="!unit || categoriesLoading"
            class="w-full border border-black/20 rounded px-3 py-2 focus:outline-none focus:border-dole-blue disabled:bg-black/5"
          >
            <option value="" disabled>
              {{
                categoriesLoading
                  ? "Loading programs..."
                  : unit
                    ? "Select a program"
                    : "Select a unit first"
              }}
            </option>
            <option
              v-for="p in availablePrograms"
              :key="p.value"
              :value="p.value"
            >
              {{ p.label }}
            </option>
          </select>
        </div>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-dole-blue text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {{ loading ? "Saving..." : "Continue" }}
        </button>
      </form>
    </div>
  </div>
</template>
