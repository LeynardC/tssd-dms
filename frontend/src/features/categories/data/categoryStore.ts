import { apiFetch, readCookie, getXsrfToken } from "../../auth/authService";

export interface CategoryRecord {
  id: number;
  code: string;
  name: string;
  unit: "unit_001" | "unit_002" | "unit_003";
  retired: boolean;
  created_at: string;
}

export async function getAllCategories(): Promise<CategoryRecord[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ categories: CategoryRecord[] }>(
    "/api/categories",
    { xsrf },
  );
  return result.categories;
}

export async function addCategory(
  code: string,
  name: string,
  unit: CategoryRecord["unit"],
): Promise<CategoryRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ category: CategoryRecord }>(
    "/api/categories",
    {
      method: "POST",
      xsrf,
      body: JSON.stringify({ code, name, unit }),
    },
  );
  return result.category;
}

export async function renameCategory(
  id: number,
  newName: string,
): Promise<CategoryRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ category: CategoryRecord }>(
    `/api/categories/${id}/rename`,
    { method: "PATCH", xsrf, body: JSON.stringify({ name: newName }) },
  );
  return result.category;
}

export async function toggleCategoryStatus(
  id: number,
): Promise<CategoryRecord> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ category: CategoryRecord }>(
    `/api/categories/${id}/toggle-status`,
    { method: "PATCH", xsrf },
  );
  return result.category;
}
