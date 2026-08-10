const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// AuthContext subscribes here so a refresh failure (expired/revoked session)
// logs the user out from one place instead of every call site checking 401s.
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

async function rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
}

export async function refreshAccessToken(): Promise<{ user: unknown; accessToken: string } | null> {
  const res = await fetch(`${API_URL}/api/identity/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  setAccessToken(data.accessToken);
  return data;
}

// Access tokens are short-lived (15m) by design; a 401 here almost always
// means it just expired, so retry once against a fresh one via the httpOnly
// refresh cookie before giving up and logging the user out.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let res = await rawFetch(path, options);
  if (res.status === 401 && path !== "/api/identity/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, options);
    } else {
      unauthorizedHandler?.();
    }
  }
  return res;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.formErrors?.[0] ?? data.error ?? "Request failed");
  }
  return data as T;
}
