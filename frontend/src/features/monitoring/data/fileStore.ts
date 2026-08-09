import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

const PREVIEWABLE_MIMES = ["application/pdf", "image/jpeg", "image/png"];

export interface FileRecord {
  id: number;
  program_id: string;
  folder_id: number | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number;
  description: string | null;
  locked: boolean;
  parsed_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  uploader?: { id: number; name: string };
}

export async function getFiles(
  programId: string,
  folderId: number | null,
): Promise<FileRecord[]> {
  const params = new URLSearchParams({ program_id: programId });
  params.set("folder_id", folderId === null ? "null" : String(folderId));
  const result = await apiFetch<{ files: FileRecord[] }>(
    `/api/files?${params.toString()}`,
  );
  return result.files;
}

export async function getAllProgramFiles(
  programId: string,
): Promise<FileRecord[]> {
  const params = new URLSearchParams({ program_id: programId });
  const result = await apiFetch<{ files: FileRecord[] }>(
    `/api/files?${params.toString()}`,
  );
  return result.files;
}

export async function getFileById(id: number): Promise<FileRecord> {
  const result = await apiFetch<{ file: FileRecord }>(`/api/files/${id}`);
  return result.file;
}

export async function uploadFile(
  programId: string,
  folderId: number | null,
  file: File,
  parsedData?: unknown,
): Promise<FileRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const formData = new FormData();
  formData.append("program_id", programId);
  if (folderId !== null) formData.append("folder_id", String(folderId));
  formData.append("file", file);
  if (parsedData !== undefined) {
    formData.append("parsed_data", JSON.stringify(parsedData));
  }

  const result = await apiFetch<{ file: FileRecord }>("/api/files", {
    method: "POST",
    xsrf,
    body: formData,
  });
  return result.file;
}

export function getDownloadUrl(fileId: number): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${base}/api/files/${fileId}/download`;
}

export async function renameFile(
  id: number,
  name: string,
): Promise<FileRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ file: FileRecord }>(
    `/api/files/${id}/rename`,
    { method: "PATCH", xsrf, body: JSON.stringify({ name }) },
  );
  return result.file;
}

export async function moveFile(
  id: number,
  folderId: number | null,
): Promise<FileRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ file: FileRecord }>(`/api/files/${id}/move`, {
    method: "PATCH",
    xsrf,
    body: JSON.stringify({ folder_id: folderId }),
  });
  return result.file;
}

export async function toggleFileLock(id: number): Promise<FileRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ file: FileRecord }>(
    `/api/files/${id}/toggle-lock`,
    { method: "PATCH", xsrf },
  );
  return result.file;
}

export async function deleteFile(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/files/${id}`, { method: "DELETE", xsrf });
}

export function isPreviewable(mimeType: string): boolean {
  return PREVIEWABLE_MIMES.includes(mimeType);
}

export function getPreviewUrl(fileId: number): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${base}/api/files/${fileId}/preview`;
}
