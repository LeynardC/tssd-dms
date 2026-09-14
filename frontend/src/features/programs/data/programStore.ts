import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface ProgramRecord {
  id: number;
  code: string;
  name: string;
  unit: string;
  retired: boolean;
  retired_at: string | null;
  retired_by_name: string | null;
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

export async function retireProgram(id: number): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    `/api/programs/${id}/retire`,
    { method: "PATCH", xsrf },
  );
  return result.program;
}

// Requires a fresh identity re-verification (password, passkey, or
// authenticator code) — see useIdentityVerify — or the backend responds
// 423 "Password confirmation required."
export async function restoreProgram(id: number): Promise<ProgramRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ program: ProgramRecord }>(
    `/api/programs/${id}/restore`,
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
