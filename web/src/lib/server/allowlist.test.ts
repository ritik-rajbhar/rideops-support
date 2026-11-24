import { describe, expect, it } from "vitest";
import { resolveProxyTarget } from "@/lib/server/allowlist";

const none = new URLSearchParams();

describe("resolveProxyTarget", () => {
  it("allows contract paths", () => {
    expect(resolveProxyTarget("GET", ["health"], none)?.path).toBe("/health");
    expect(resolveProxyTarget("GET", ["metrics", "weekly"], none)?.path).toBe("/metrics/weekly");
    expect(resolveProxyTarget("GET", ["metrics", "diagnosis"], none)?.path).toBe("/metrics/diagnosis");
    expect(resolveProxyTarget("GET", ["tickets", "T-1"], none)?.path).toBe("/tickets/T-1");
    expect(resolveProxyTarget("POST", ["tickets", "T-1", "precheck"], none)?.path).toBe(
      "/tickets/T-1/precheck",
    );
  });

  it("keeps only known query parameters", () => {
    const search = new URLSearchParams("q=late&limit=5&admin=1");
    expect(resolveProxyTarget("GET", ["tickets"], search)?.query).toBe("?q=late&limit=5");
  });

  it.each([
    ["GET", ["admin"]],
    ["GET", ["tickets", ".."]],
    ["GET", ["tickets", "a%2Fb"]],
    ["GET", ["tickets", "T-1", "precheck"]],
    ["POST", ["tickets"]],
    ["POST", ["tickets", "T-1", "delete"]],
    ["DELETE", ["tickets", "T-1"]],
    ["GET", ["metrics", "secret"]],
  ])("rejects %s %j", (method, segments) => {
    expect(resolveProxyTarget(method, segments, none)).toBeNull();
  });
});
