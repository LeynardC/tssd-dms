import { apiFetch, readCookie, getXsrfToken } from "../authService";

export interface PasskeyRecord {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export async function getPasskeys(): Promise<PasskeyRecord[]> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  const result = await apiFetch<{ passkeys: PasskeyRecord[] }>(
    "/api/user/passkeys",
    { xsrf },
  );
  return result.passkeys;
}

// Base64url helpers — WebAuthn options/results are transmitted as
// base64url strings over JSON, but the browser API needs raw ArrayBuffers.
function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials
  );
}

// Full registration flow: get options from the server, prompt the device
// (fingerprint/Face ID/Windows Hello/security key) via the browser's
// native WebAuthn API, then send the result back to save it.
export async function registerPasskey(name: string): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());

  const { options } = await apiFetch<{ options: any }>(
    "/user/passkeys/options",
    { xsrf },
  );

  const publicKey: CredentialCreationOptions["publicKey"] = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
    excludeCredentials: (options.excludeCredentials ?? []).map((c: any) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error("Passkey creation was cancelled.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  await apiFetch("/user/passkeys", {
    method: "POST",
    xsrf,
    body: JSON.stringify({
      name,
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          attestationObject: bufferToBase64url(response.attestationObject),
        },
      },
    }),
  });
}

// Login-time passkey flow — used on the login page, before the user is
// authenticated. Mirrors registerPasskey()'s shape but uses
// navigator.credentials.get() instead of .create(), since we're proving
// possession of an existing passkey rather than creating a new one.
export async function loginWithPasskey(): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());

  const { options } = await apiFetch<{ options: any }>(
    "/passkeys/login/options",
    { xsrf },
  );

  const publicKey: CredentialRequestOptions["publicKey"] = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: any) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error("Passkey sign-in was cancelled.");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  await apiFetch("/passkeys/login", {
    method: "POST",
    xsrf,
    body: JSON.stringify({
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          authenticatorData: bufferToBase64url(response.authenticatorData),
          signature: bufferToBase64url(response.signature),
          userHandle: response.userHandle
            ? bufferToBase64url(response.userHandle)
            : null,
        },
      },
    }),
  });
}

export async function deletePasskey(id: number): Promise<void> {
  const xsrf = readCookie("XSRF-TOKEN") ?? (await getXsrfToken());
  await apiFetch(`/user/passkeys/${id}`, { method: "DELETE", xsrf });
}
