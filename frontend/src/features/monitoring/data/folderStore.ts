import { currentRole, assignedProgram } from "../role";
import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface FolderRecord {
  id: number;
  program_id: string;
  name: string;
  parent_id: number | null;
  created_by: number;
  retired: boolean;
  created_at: string;
  updated_at: string;
}

// --- Permission check (per Frontend-Status-QA doc §3.5, RESOLVED) ---
// Staff: only within their own assigned program. Chief: any program, but never uploads.
export function canManageFolders(programId: string): boolean {
  if (currentRole.value === "chief") return true;
  return assignedProgram.value === programId;
}

// --- Read ---

// In-flight de-duplication only — NOT a time-based cache. Within one tick a
// single navigation can ask for this program's folders several times
// (the explorer's loadAll, the breadcrumb trail, a child-folder lookup);
// this collapses those into one request. Once the request settles the entry
// is dropped, so the very next call re-fetches — folder data stays fresh,
// which matters now that the explorer re-pulls on window focus.
const foldersInFlight = new Map<string, Promise<FolderRecord[]>>();

export async function getFolders(programId: string): Promise<FolderRecord[]> {
  const pending = foldersInFlight.get(programId);
  if (pending) return pending;

  const request = apiFetch<{ folders: FolderRecord[] }>(
    `/api/folders?program_id=${encodeURIComponent(programId)}`,
  )
    .then((result) => result.folders)
    .finally(() => foldersInFlight.delete(programId));

  foldersInFlight.set(programId, request);
  return request;
}

export async function getChildFolders(
  programId: string,
  parentId: number | null,
): Promise<FolderRecord[]> {
  const all = await getFolders(programId);
  return all.filter((f) => f.parent_id === parentId);
}

export async function getFolderById(
  programId: string,
  id: number,
): Promise<FolderRecord | null> {
  const all = await getFolders(programId);
  return all.find((f) => f.id === id) ?? null;
}

// Ordered list of folder names, root -> leaf.
export async function getFolderPath(
  programId: string,
  folderId: number | null,
): Promise<string[]> {
  const all = await getFolders(programId);
  const byId = new Map(all.map((f) => [f.id, f]));
  const path: string[] = [];
  let current = folderId ? (byId.get(folderId) ?? null) : null;
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? (byId.get(current.parent_id) ?? null) : null;
  }
  return path;
}

// --- Write (permission-gated client-side AND server-side — the backend's
// FolderController@canManage() is the authoritative check; this client-side
// guard just avoids a pointless round-trip for an action we already know
// will be rejected). ---

export async function createFolder(
  programId: string,
  name: string,
  parentId: number | null,
): Promise<FolderRecord> {
  if (!canManageFolders(programId)) {
    throw new Error(
      `Not permitted: current user cannot manage folders for program "${programId}".`,
    );
  }
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ folder: FolderRecord }>("/api/folders", {
    method: "POST",
    xsrf,
    body: JSON.stringify({
      program_id: programId,
      name: name.trim(),
      parent_id: parentId,
    }),
  });
  return result.folder;
}

export async function renameFolder(
  programId: string,
  id: number,
  newName: string,
): Promise<FolderRecord> {
  if (!canManageFolders(programId)) {
    throw new Error(
      `Not permitted: current user cannot manage folders for program "${programId}".`,
    );
  }
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ folder: FolderRecord }>(
    `/api/folders/${id}/rename`,
    { method: "PATCH", xsrf, body: JSON.stringify({ name: newName.trim() }) },
  );
  return result.folder;
}

// Soft-delete only — matches the Programs retire/rename pattern, same
// decision made when this file was first designed.
export async function retireFolder(
  programId: string,
  id: number,
): Promise<void> {
  if (!canManageFolders(programId)) {
    throw new Error(
      `Not permitted: current user cannot manage folders for program "${programId}".`,
    );
  }
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/folders/${id}/retire`, { method: "PATCH", xsrf });
}
