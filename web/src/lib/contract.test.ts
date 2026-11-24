import { describe, expect, it } from "vitest";
import {
  backtestSchema,
  precheckResponseSchema,
  ticketListSchema,
  ticketSchema,
  verdictSchema,
  weeklyMetricsSchema,
} from "@/lib/contract";

const ticket = {
  ticket_id: "T-1",
  created_at: "2026-01-05T08:00:00Z",
  channel: "email",
  client_name: "Example Client",
  client_tier: "gold",
  category: "routing",
  priority: "p2",
  description: "Sample text",
  assigned_agent: null,
  status: "open",
  escalated_to_eng: false,
};

const run = {
  escalations: 10,
  flagged_by_verdict: { needs_info: 1 },
  precision_by_verdict: {
    needs_info: { flagged: 1, correct: 0, precision: null, base_rate: 0.1, lift: null, target_outcomes: [] },
  },
  held_for_review: { count: 2, avoidable: 1, precision_avoidable: 0.5, base_rate_avoidable: 0.4, recall_avoidable: 0.2 },
  fixed_bugs_delayed: { count: 1, fixed_total: 5, rate: 0.2, by_verdict: {} },
  p1: { total: 2, misses: 0 },
  assumptions: ["Sample assumption"],
  clean_holdout: false,
};
const backtest = {
  ...run,
  result_label: "revised_not_clean_holdout",
  methodology_note: "Sample note",
  original_pre_change: { ...run, result_label: "original_pre_change" },
};

describe("contract", () => {
  it("parses ticket lists, normalises priority and keeps extra fields", () => {
    const parsed = ticketListSchema.parse({ items: [{ ...ticket, extra: 1 }], total: 1 });
    expect(parsed.items[0]?.priority).toBe("P2");
    expect(parsed.items[0]).toHaveProperty("extra", 1);
  });

  it("rejects an unknown verdict rather than guessing", () => {
    const result = precheckResponseSchema.safeParse({
      ticket_id: "T-1",
      verdict: "hold",
      confidence_band: "low",
      reasons: [],
      checklist: [],
      similar: [],
      suggested_action: "",
      override_allowed: true,
    });
    expect(result.success).toBe(false);
  });

  it("allows null metrics on a week", () => {
    const parsed = weeklyMetricsSchema.parse({
      weeks: [{ week_start: "2026-01-05", partial: true, csat_avg: null }],
    });
    expect(parsed.weeks[0]?.avg_open_7d).toBeNull();
  });

  it("parses the backtest shape, including a null precision", () => {
    const parsed = backtestSchema.parse(backtest);
    expect(parsed.precision_by_verdict.needs_info?.precision).toBeNull();
    expect(parsed.original_pre_change?.result_label).toBe("original_pre_change");
  });

  it("rejects a backtest without its result label or methodology note", () => {
    expect(backtestSchema.safeParse({ ...backtest, result_label: undefined }).success).toBe(false);
    expect(backtestSchema.safeParse({ ...backtest, methodology_note: undefined }).success).toBe(false);
  });

  it("keeps parsing the retired try_l1_fix verdict", () => {
    expect(verdictSchema.parse("try_l1_fix")).toBe("try_l1_fix");
  });

  it("parses post-triage ticket fields as null on open tickets", () => {
    const parsed = ticketSchema.parse({ ...ticket, client_id: "C-1", eng_outcome: null });
    expect(parsed.client_id).toBe("C-1");
    expect(parsed.eng_outcome).toBeNull();
    expect(parsed.csat_score).toBeNull();
  });
});
