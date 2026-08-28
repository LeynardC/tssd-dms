import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface UnitRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  retired: boolean;
  created_at: string;
}

export async function getAllUnits(): Promise<UnitRecord[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ units: UnitRecord[] }>("/api/units", {
    xsrf,
  });
  return result.units;
}

export async function addUnit(
  code: string,
  name: string,
  description?: string,
): Promise<UnitRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ unit: UnitRecord }>("/api/units", {
    method: "POST",
    xsrf,
    body: JSON.stringify({ code, name, description }),
  });
  return result.unit;
}

export async function renameUnit(
  id: number,
  newName: string,
): Promise<UnitRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ unit: UnitRecord }>(
    `/api/units/${id}/rename`,
    { method: "PATCH", xsrf, body: JSON.stringify({ name: newName }) },
  );
  return result.unit;
}

export async function updateUnitDescription(
  id: number,
  description: string,
): Promise<UnitRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ unit: UnitRecord }>(
    `/api/units/${id}/description`,
    { method: "PATCH", xsrf, body: JSON.stringify({ description }) },
  );
  return result.unit;
}

export async function toggleUnitStatus(id: number): Promise<UnitRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ unit: UnitRecord }>(
    `/api/units/${id}/toggle-status`,
    { method: "PATCH", xsrf },
  );
  return result.unit;
}
