import { apiFetch, readCookie, getXsrfToken } from "../authService";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface OAuthAccountLink {
  id: number;
  user_id: number;
  provider: string;
  provider_user_id: string;
  provider_email: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  user?: { id: number; name: string; username: string; staff_id: string };
}

// Real browser navigations, not XHR — Google needs to redirect the whole
// tab back to our backend, so these can't go through apiFetch(). Works for
// both "link" (already logged in) and "login" (not logged in yet) — which
// one happens is decided server-side by whether the session is
// authenticated at the moment /auth/google/redirect is hit.
export function startGoogleLink(): void {
  window.location.href = `${API_BASE}/auth/google/redirect`;
}

export function startGoogleLogin(): void {
  window.location.href = `${API_BASE}/auth/google/redirect`;
}

// The backend redirects back with a short ?oauth_error=<code> rather than a
// full sentence (keeps readable copy out of history/logs). Map it here.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_failed:
    "Could not complete sign-in with Google. Please try again.",
  link_session_expired:
    "Your session expired. Please log in and try linking again.",
  link_already_requested:
    "You've already requested to link this Google account.",
  link_taken:
    "This Google account is already linked to another staff account.",
  link_has_one:
    "You already have a linked or pending Google account. Unlink it first before linking a different one.",
  login_not_linked:
    "This Google account isn't linked to a DOLE staff account yet, or is still awaiting Chief approval.",
  login_deactivated:
    "This account has been deactivated. Contact your Chief for assistance.",
  login_2fa_enabled:
    "Google sign-in isn't available for accounts with two-step verification enabled. Please sign in with your username and password.",
};

export function oauthErrorMessage(code: string): string {
  return (
    OAUTH_ERROR_MESSAGES[code] ??
    "Could not complete that Google request. Please try again."
  );
}

export const googleSignInEnabled =
  import.meta.env.VITE_GOOGLE_ENABLED === "true";

export async function getMyOAuthLinks(): Promise<OAuthAccountLink[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ links: OAuthAccountLink[] }>(
    "/api/oauth-links",
    { xsrf },
  );
  return result.links;
}

export async function unlinkOAuthAccount(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/api/oauth-links/${id}`, { method: "DELETE", xsrf });
}

export async function getPendingOAuthLinks(): Promise<OAuthAccountLink[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ links: OAuthAccountLink[] }>(
    "/api/oauth-links/pending",
    { xsrf },
  );
  return result.links;
}

export async function approveOAuthLink(id: number): Promise<OAuthAccountLink> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ link: OAuthAccountLink }>(
    `/api/oauth-links/${id}/approve`,
    { method: "POST", xsrf },
  );
  return result.link;
}

export async function rejectOAuthLink(
  id: number,
  reason?: string,
): Promise<OAuthAccountLink> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ link: OAuthAccountLink }>(
    `/api/oauth-links/${id}/reject`,
    { method: "POST", xsrf, body: JSON.stringify({ reason }) },
  );
  return result.link;
}
