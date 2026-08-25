import { apiFetch, readCookie, getXsrfToken } from "../authService";

export interface TwoFactorQrCode {
  svg: string;
}

export interface TwoFactorSecretKey {
  secretKey: string;
}

// Step 1 — required before any 2FA action, since fortify.php has
// confirmPassword: true set for both twoFactorAuthentication() and
// passkeys(). This re-verifies the currently logged-in user's password.
export async function confirmPassword(password: string): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/user/confirm-password", {
    method: "POST",
    xsrf,
    body: JSON.stringify({ password }),
  });
}

// Step 2 — generates a secret + pending QR code. 2FA is NOT active yet
// at this point, only "pending confirmation".
export async function enableTwoFactor(): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/user/two-factor-authentication", {
    method: "POST",
    xsrf,
  });
}

// Step 3 — the QR code SVG to scan with an authenticator app.
export async function getTwoFactorQrCode(): Promise<string> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<TwoFactorQrCode>("/user/two-factor-qr-code", {
    xsrf,
  });
  return result.svg;
}

// Manual-entry fallback for the QR code, for authenticator apps that
// prefer typing the key over scanning.
export async function getTwoFactorSecretKey(): Promise<string> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<TwoFactorSecretKey>(
    "/user/two-factor-secret-key",
    { xsrf },
  );
  return result.secretKey;
}

// Step 4 — the 6-digit code from the user's authenticator app. Only after
// this succeeds is 2FA actually turned on.
export async function confirmTwoFactor(code: string): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/user/confirmed-two-factor-authentication", {
    method: "POST",
    xsrf,
    body: JSON.stringify({ code }),
  });
}

// Step 5 — one-time backup codes, shown once for the user to save.
export async function getRecoveryCodes(): Promise<string[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  return apiFetch<string[]>("/user/two-factor-recovery-codes", { xsrf });
}

export async function regenerateRecoveryCodes(): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/user/two-factor-recovery-codes", {
    method: "POST",
    xsrf,
  });
}

// Login-time challenge, after login() succeeds but 2FA is still pending.
// Accepts either a 6-digit authenticator code OR a recovery code — send
// only one of the two per attempt.
export async function twoFactorChallenge(input: {
  code?: string;
  recovery_code?: string;
}): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/two-factor-challenge", {
    method: "POST",
    xsrf,
    body: JSON.stringify(input),
  });
}

// Disable — also gated behind a fresh confirmPassword() call by the caller.
export async function disableTwoFactor(): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch("/user/two-factor-authentication", {
    method: "DELETE",
    xsrf,
  });
}
