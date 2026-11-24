import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Backtest, BacktestRun } from "@/lib/contract";
import { BacktestResults } from "@/components/impact/ImpactView";
import { toChartRows } from "@/components/impact/TrendChart";

const run: BacktestRun = {
  window: { start: "2026-01-01 00:00:00", end: "2026-01-31 23:59:00" },
  policy_version: "sample.v2",
  escalations: 100,
  flagged_by_verdict: { likely_known_issue: 20 },
  precision_by_verdict: {
    likely_known_issue: { flagged: 20, correct: 8, precision: 0.4, base_rate: 0.2, lift: 2, target_outcomes: [] },
  },
  held_for_review: { count: 20, avoidable: 12, precision_avoidable: 0.6, base_rate_avoidable: 0.5, recall_avoidable: 0.25 },
  fixed_bugs_delayed: { count: 7, fixed_total: 50, rate: 0.14, by_verdict: {} },
  p1: { total: 5, misses: 0 },
  assumptions: ["Sample assumption"],
  result_label: "revised_not_clean_holdout",
  clean_holdout: false,
};
const data: Backtest = {
  ...run,
  methodology_note: "Sample methodology note",
  original_pre_change: {
    ...run,
    result_label: "original_pre_change",
    fixed_bugs_delayed: { count: 11, fixed_total: 50, rate: 0.22, by_verdict: {} },
  },
};

describe("BacktestResults", () => {
  it("labels the result and shows the methodology prominently", () => {
    render(<BacktestResults data={data} />);
    expect(within(screen.getByRole("note")).getByText("Revised policy: not a clean holdout")).toBeInTheDocument();
    expect(screen.getByText("Sample methodology note")).toBeInTheDocument();
    expect(screen.getByText(/Do not read this as a clean holdout/)).toBeInTheDocument();
  });

  it("shows the required measures and compares original with revised", () => {
    render(<BacktestResults data={data} />);
    expect(screen.getAllByText("7 of 50").length).toBeGreaterThan(0);
    expect(screen.getByText("11 of 50")).toBeInTheDocument();
    expect(screen.getAllByText("0 of 5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40.0%").length).toBeGreaterThan(0);
    expect(screen.getByText(/2\.0x lift/)).toBeInTheDocument();
    expect(screen.getAllByText("12 of 20").length).toBeGreaterThan(0);
  });

  it("renders without the original run", () => {
    render(<BacktestResults data={{ ...data, original_pre_change: null }} />);
    expect(screen.queryByRole("columnheader", { name: /Original replay/ })).not.toBeInTheDocument();
  });
});

describe("toChartRows", () => {
  it("draws only the partial week on the dashed series, joined to the last full week", () => {
    const rows = toChartRows([
      { week: "2026-01-05", partial: false, value: 1 },
      { week: "2026-01-12", partial: false, value: 2 },
      { week: "2026-01-19", partial: true, value: 3 },
    ]);
    expect(rows.map((row) => row.full)).toEqual([1, 2, null]);
    expect(rows.map((row) => row.bridge)).toEqual([null, 2, 3]);
  });
});
