<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RotateCcw, FolderOpen } from "@lucide/vue";
import {
  ensureProgramsLoaded,
  refreshPrograms,
  allPrograms,
  programsLoading,
  programsError,
} from "../data/programCache";
import { ensureUnitsLoaded, unitLabels } from "../../units/data/unitCache";
import { restoreProgram, type ProgramRecord } from "../data/programStore";
import { useIdentityVerify } from "../../../composables/useIdentityVerify";
import { useToast } from "../../../composables/useToast";
import { ApiError } from "../../auth/authService";

onMounted(ensureProgramsLoaded);
onMounted(ensureUnitsLoaded);

const { showToast } = useToast();
const { verifyIdentity } = useIdentityVerify();

const retiredPrograms = computed(() =>
  [...allPrograms.value]
    .filter((p) => p.retired)
    .sort((a, b) => (b.retired_at ?? "").localeCompare(a.retired_at ?? "")),
);

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function handleRestore(program: ProgramRecord) {
  const ok = await verifyIdentity({
    title: "Verify your identity to restore this program",
    message: `Restoring "${program.name}" will make it active again, visible everywhere it was before.`,
  });
  if (!ok) return;

  try {
    await restoreProgram(program.id);
    showToast(`"${program.name}" restored.`, "success");
    await refreshPrograms();
  } catch (err) {
    showToast(
      err instanceof ApiError ? err.message : "Could not restore this program.",
      "error",
    );
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper">
    <header class="bg-dole-blue text-white px-8 py-6 shadow-md">
      <router-link
        :to="{ name: 'programs' }"
        class="text-xs text-white/70 hover:text-white"
        >← Programs</router-link
      >
      <h1 class="font-display text-2xl font-semibold mt-1">
        Archived Programs
      </h1>
      <p class="text-sm text-white/75 mt-1">
        Retired programs are kept here. Browse their files anytime, or
        restore one back to active — restoring needs identity
        re-verification.
      </p>
    </header>

    <main class="max-w-4xl mx-auto px-8 py-8">
      <div
        v-if="programsLoading"
        class="bg-white border border-black/10 rounded-lg overflow-hidden animate-pulse"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="flex items-center gap-4 p-3 border-b border-black/5 last:border-0"
        >
          <div class="h-4 w-32 bg-black/10 rounded"></div>
          <div class="h-3 w-24 bg-black/10 rounded"></div>
        </div>
      </div>
      <p v-else-if="programsError" class="text-sm text-red-600">
        {{ programsError }}
      </p>
      <p
        v-else-if="retiredPrograms.length === 0"
        class="text-sm text-black/50"
      >
        No archived programs. Anything you retire from the Programs page
        shows up here.
      </p>

      <div
        v-else
        class="bg-white border border-black/10 rounded-lg overflow-hidden"
      >
        <table class="w-full text-sm">
          <thead>
            <tr
              class="text-left text-black/50 bg-black/5 border-b border-black/10"
            >
              <th class="p-3">Name</th>
              <th class="p-3">Unit</th>
              <th class="p-3">Retired By</th>
              <th class="p-3">Retired On</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="prog in retiredPrograms"
              :key="prog.id"
              class="border-b border-black/5 last:border-0"
            >
              <td class="p-3 font-medium">{{ prog.name }}</td>
              <td class="p-3 text-black/60">
                {{ unitLabels[prog.unit] ?? prog.unit }}
              </td>
              <td class="p-3 text-black/60">
                {{ prog.retired_by_name ?? "—" }}
              </td>
              <td class="p-3 text-black/60">
                {{ formatDateTime(prog.retired_at) }}
              </td>
              <td class="p-3 text-right space-x-3">
                <router-link
                  :to="{
                    name: 'file-explorer',
                    params: { programId: prog.code, folderPath: [] },
                  }"
                  class="inline-flex items-center gap-1 text-xs text-dole-blue hover:underline"
                >
                  <FolderOpen :size="13" />
                  Browse
                </router-link>
                <button
                  @click="handleRestore(prog)"
                  class="inline-flex items-center gap-1 text-xs font-medium border border-dole-blue text-dole-blue px-2.5 py-1.5 rounded hover:bg-dole-blue/5 transition"
                >
                  <RotateCcw :size="13" />
                  Restore
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
