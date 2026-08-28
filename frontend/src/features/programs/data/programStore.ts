import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface ProgramRecord {
  id: number;
  code: string;
  name: string;
  unit: string;
  retired: boolean;
  created_at: string;
  founded_at: string | null;
  vision: string | null;
  mission: string | null;
  scope: string | null;
}

export interface ProgramStaffMember {
  id: number;
  name: string;
  position: string | null;
}

export async function getAllPrograms(): Promise<ProgramRecord[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ programs: ProgramRecord[] }>(
    "/api/programs",
    { xsrf },
  );
  return result.programs;
}

export async function addProgram(
  code: string,
  name: string,
  unit: string,
): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    "/api/programs",
    {
      method: "POST",
      xsrf,
      body: JSON.stringify({ code, name, unit }),
    },
  );
  return result.program;
}

export async function renameProgram(
  id: number,
  newName: string,
): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    `/api/programs/${id}/rename`,
    { method: "PATCH", xsrf, body: JSON.stringify({ name: newName }) },
  );
  return result.program;
}

export async function toggleProgramStatus(
  id: number,
): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    `/api/programs/${id}/toggle-status`,
    { method: "PATCH", xsrf },
  );
  return result.program;
}

export async function getProgramProfile(
  code: string,
): Promise<{ program: ProgramRecord; staff: ProgramStaffMember[] }> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  return apiFetch<{ program: ProgramRecord; staff: ProgramStaffMember[] }>(
    `/api/programs/${code}`,
    { xsrf },
  );
}

export interface ProgramProfileUpdate {
  founded_at?: string | null;
  vision?: string | null;
  mission?: string | null;
  scope?: string | null;
}

export async function updateProgramProfile(
  code: string,
  updates: ProgramProfileUpdate,
): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    `/api/programs/${code}/profile`,
    { method: "PATCH", xsrf, body: JSON.stringify(updates) },
  );
  return result.program;
}
