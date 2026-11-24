import { NextResponse, type NextRequest } from "next/server";
import { resolveProxyTarget } from "@/lib/server/allowlist";
import {
  UPSTREAM_TIMEOUT_MS,
  apiAccessCode,
  apiBaseUrl,
  isColdStartStatus,
  isSameOrigin,
} from "@/lib/server/upstream";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

type RouteContext = { params: Promise<{ path: string[] }> };

const errorResponse = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: NO_STORE });

async function forward(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = resolveProxyTarget(request.method, path, request.nextUrl.searchParams);
  if (!target) return errorResponse(404, "not_found");

  if (request.method === "POST" && !isSameOrigin(request)) {
    return errorResponse(403, "forbidden");
  }

  const accessCode = apiAccessCode();
  const baseUrl = apiBaseUrl();
  if (!accessCode || !baseUrl) return errorResponse(500, "not_configured");

  let body: string | undefined;
  if (request.method === "POST") {
    body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large");
    }
    try {
      JSON.parse(body);
    } catch {
      return errorResponse(400, "invalid_json");
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/v1${target.path}${target.query}`, {
      method: request.method,
      headers: {
        Accept: "application/json",
        "X-Access-Code": accessCode,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return errorResponse(503, "upstream_unavailable");
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return errorResponse(500, "not_configured");
  }
  if (isColdStartStatus(upstream.status)) return errorResponse(503, "upstream_unavailable");

  const isJson = upstream.headers.get("content-type")?.includes("application/json");
  if (!isJson) return errorResponse(upstream.ok ? 502 : upstream.status, "bad_upstream_response");

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { ...NO_STORE, "Content-Type": "application/json" },
  });
}

export const GET = forward;
export const POST = forward;
