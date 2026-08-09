const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface CurrentUser {
  id: number;
  name: string;
  username: string;
  staff_id: string;
  position: string | null;
  unit: string | null;
  assigned_program: string | null;
  must_change_password: boolean;
  profile_completed: boolean;
  role: "chief" | "staff";
}

interface ApiErrorBody {
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.errors = body.errors;
  }
}

export function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export async function getXsrfToken(): Promise<string> {
  await fetch(`${API_BASE}/sanctum/csrf-cookie`, { credentials: "include" });
  const token = readCookie("XSRF-TOKEN");
  if (!token) {
    throw new Error(
      "Could not read XSRF-TOKEN cookie — check SANCTUM_STATEFUL_DOMAINS matches this frontend's origin.",
    );
  }
  return token;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { xsrf?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.xsrf) headers.set("X-XSRF-TOKEN", options.xsrf);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 204) return undefined as T;

  const body = await response
    .json()
    .catch(() => ({ message: response.statusText }));

  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody);
  }
  return body as T;
}

export async function login(username: string, password: string): Promise<void> {
  const xsrf = await getXsrfToken();
  await apiFetch("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    xsrf,
  });
}

export async function logout(): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/logout", { method: "POST", xsrf });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiFetch<CurrentUser>("/api/user");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// Used by D2's screen next, not wired to any UI yet — written now since it
// belongs in the same service layer as everything else auth-related.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/api/password/change", {
    method: "PUT",
    xsrf,
    body: JSON.stringify({
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: newPassword,
    }),
  });
}

// Used by D3's screen next — same reasoning as above.
export async function completeProfile(fields: {
  position: string;
  unit: string;
  assigned_program: string;
}): Promise<CurrentUser> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ user: CurrentUser }>(
    "/api/profile/complete",
    { method: "PUT", xsrf, body: JSON.stringify(fields) },
  );
  return result.user;
}

export interface CreatedStaffUser {
  id: number;
  name: string;
  username: string;
  staff_id: string;
  must_change_password: boolean;
  profile_completed: boolean;
}

export interface CreateStaffResult {
  user: CreatedStaffUser;
  temp_password: string;
}

export async function createStaffAccount(fields: {
  name: string;
  username: string;
  staff_id: string;
}): Promise<CreateStaffResult> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  return apiFetch<CreateStaffResult>("/api/staff", {
    method: "POST",
    xsrf,
    body: JSON.stringify(fields),
  });
}

export interface StaffMember {
  id: number;
  name: string;
  username: string;
  staff_id: string;
  position: string | null;
  unit: string | null;
  assigned_program: string | null;
  must_change_password: boolean;
  profile_completed: boolean;
  is_active: boolean;
  created_at: string;
}

export async function getStaffList(): Promise<StaffMember[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ staff: StaffMember[] }>("/api/staff", {
    xsrf,
  });
  return result.staff;
}

export async function toggleStaffActive(id: number): Promise<StaffMember> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ user: StaffMember }>(
    `/api/staff/${id}/toggle-active`,
    { method: "PATCH", xsrf },
  );
  return result.user;
}

export async function resetStaffPassword(
  id: number,
): Promise<{ user: StaffMember; temp_password: string }> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  return apiFetch(`/api/staff/${id}/reset-password`, { method: "POST", xsrf });
}

export async function updateStaffProfile(
  id: number,
  fields: { position: string; unit: string; assigned_program: string },
): Promise<StaffMember> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ user: StaffMember }>(`/api/staff/${id}`, {
    method: "PATCH",
    xsrf,
    body: JSON.stringify(fields),
  });
  return result.user;
}

export async function deleteStaffAccount(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/staff/${id}`, { method: "DELETE", xsrf });
}
