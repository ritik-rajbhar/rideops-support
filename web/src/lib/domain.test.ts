import { describe, expect, it } from "vitest";
import { formatRate, requiresOverrideReason, sortQueue, toPercentSeries } from "@/lib/domain";

describe("sortQueue", () => {
  it("sorts by priority, then oldest first", () => {
    const sorted = sortQueue([
      { ticket_id: "a", priority: "P3", created_at: "2026-01-01T00:00:00Z" },
      { ticket_id: "b", priority: "P1", created_at: "2026-01-03T00:00:00Z" },
      { ticket_id: "c", priority: "P1", created_at: "2026-01-02T00:00:00Z" },
    ]);
    expect(sorted.map((ticket) => ticket.ticket_id)).toEqual(["c", "b", "a"]);
  });
});

describe("requiresOverrideReason", () => {
  it("requires a reason when escalating against the advice", () => {
    expect(requiresOverrideReason("escalated", "try_l1_fix", "P2")).toBe(true);
    expect(requiresOverrideReason("escalated", null, "P3")).toBe(true);
  });

  it("does not require one on P1, on ready verdicts or other actions", () => {
    expect(requiresOverrideReason("escalated", "try_l1_fix", "P1")).toBe(false);
    expect(requiresOverrideReason("escalated", "ready_to_escalate", "P2")).toBe(false);
    expect(requiresOverrideReason("resolved_at_l1", "needs_info", "P2")).toBe(false);
  });
});

describe("formatRate", () => {
  it("handles fractions, percentages and null", () => {
    expect(formatRate(0.125)).toBe("12.5%");
    expect(formatRate(42)).toBe("42.0%");
    expect(formatRate(null)).toBe("n/a");
  });
});

describe("toPercentSeries", () => {
  it("scales fractions and leaves percentage series alone", () => {
    expect(toPercentSeries([0.5, null])).toEqual([50, null]);
    expect(toPercentSeries([0.5, 12])).toEqual([0.5, 12]);
  });
});
