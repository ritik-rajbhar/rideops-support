import "server-only";

export const UPSTREAM_TIMEOUT_MS = 25_000;

export function apiBaseUrl(): string | null {
  const value = process.env.API_BASE_URL?.trim().replace(/\/+$/, "");
  return value ? value : null;
}

export function apiAccessCode(): string | null {
  const value = process.env.ACCESS_CODE?.trim();
  return value ? value : null;
}

/** Rejects cross-site state changes. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const isColdStartStatus = (status: number) => status === 502 || status === 503 || status === 504;
