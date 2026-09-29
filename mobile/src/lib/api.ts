const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(value: string | null) {
  token = value;
}

/**
 * Called when the API rejects the current token (expired, revoked, or the
 * account signed out elsewhere). The auth provider ends the session there.
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown = null,
  ) {
    super(message);
  }
}

/**
 * JSON request against the Laravel API with the Sanctum bearer token.
 * Throws ApiError with the API's own message, which is written for humans.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const sent = token;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(sent ? { Authorization: `Bearer ${sent}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, `Could not reach the server at ${API_URL}`);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Only for the token still in use: a slow request from a session that
    // has since been replaced must not sign the new one out.
    if (response.status === 401 && sent && sent === token) onUnauthorized?.();
    const message = (body as { message?: string } | null)?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

/**
 * Multipart POST, for uploads. React Native streams `{ uri, name, type }`
 * parts from disk, so a large file never sits in JS memory. The response is
 * returned for 2xx and 207 (partial success) alike.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<{ status: number; body: T }> {
  const sent = token;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(sent ? { Authorization: `Bearer ${sent}` } : {}) },
      body: form,
    });
  } catch (err) {
    // Not always the network: expo/fetch also throws here for a body it
    // can't encode, and that message is the one worth seeing.
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, `Upload didn’t go through: ${reason}`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && sent && sent === token) onUnauthorized?.();
    const message = (body as { message?: string } | null)?.message ?? `Upload failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return { status: response.status, body: body as T };
}

const LOOPBACK = /^(https?:)\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(?=\/|$)/i;

/**
 * A media URL the phone can load. The API stores uploads (station artwork,
 * avatars) as absolute URLs built from its APP_URL, which in development is
 * http://localhost:8000: the phone's own loopback. Swap such a host for the
 * API's, which the phone does reach. Real hosts pass through untouched.
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!LOOPBACK.test(url)) return url;
  const origin = API_URL.match(/^https?:\/\/[^/]+/i)?.[0];
  return origin ? url.replace(LOOPBACK, origin) : url;
}
