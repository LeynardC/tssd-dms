import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface BinFolderItem {
  type: "folder";
  id: number;
  name: string;
  origin_path: string;
  retired_at: string | null;
  retired_by_name: string | null;
  expires_at: string | null;
  subfolder_count: number;
  file_count: number;
  has_locked_file: boolean;
}

export interface BinFileItem {
  type: "file";
  id: number;
  name: string;
  origin_path: string;
  deleted_at: string | null;
  deleted_by_name: string | null;
  expires_at: string | null;
  size_bytes: number;
  locked: boolean;
}

export type BinItem = BinFolderItem | BinFileItem;

export interface EmptyBinResult {
  purged_folders: number;
  purged_files: number;
  skipped_locked: number;
}

export async function getRecycleBin(programId: string): Promise<BinItem[]> {
  const params = new URLSearchParams({ program_id: programId });
  const result = await apiFetch<{ items: BinItem[] }>(
    `/api/recycle-bin?${params.toString()}`,
  );
  return result.items;
}

export async function restoreFolder(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/folders/${id}/restore`, { method: "PATCH", xsrf });
}

export async function purgeFolder(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/folders/${id}/purge`, { method: "DELETE", xsrf });
}

export async function restoreFile(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/files/${id}/restore`, { method: "PATCH", xsrf });
}

export async function purgeFile(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/files/${id}/purge`, { method: "DELETE", xsrf });
}

export async function emptyBin(programId: string): Promise<EmptyBinResult> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  return apiFetch<EmptyBinResult>("/api/recycle-bin/empty", {
    method: "POST",
    xsrf,
    body: JSON.stringify({ program_id: programId }),
  });
}
