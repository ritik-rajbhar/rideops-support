// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET, POST } from "./route";

const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("proxy route", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "https://backend.test/");
    vi.stubEnv("ACCESS_CODE", "test-code");
  });

  it("forwards the code server-side to the versioned API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ items: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      new NextRequest("http://app.test/api/proxy/tickets?q=x&evil=1"),
      context("tickets"),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://backend.test/api/v1/tickets?q=x");
    expect((init?.headers as Record<string, string>)["X-Access-Code"]).toBe("test-code");
    expect(await response.text()).not.toContain("test-code");
  });

  it("does not call upstream for a path off the allow-list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("http://app.test/api/proxy/admin"), context("admin"));
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a missing server code as a configuration error", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("http://app.test/api/proxy/health"), context("health"));
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks cross-origin POST", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new NextRequest("http://app.test/api/proxy/tickets/T-1/decisions", {
        method: "POST",
        body: "{}",
        headers: { origin: "https://evil.test", host: "app.test" },
      }),
      context("tickets", "T-1", "decisions"),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unreachable backend as a cold start", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const response = await GET(new NextRequest("http://app.test/api/proxy/health"), context("health"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
  });

  it("reports a rejected server code as a configuration error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "no" }, 401)));
    const response = await GET(new NextRequest("http://app.test/api/proxy/health"), context("health"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });
});
