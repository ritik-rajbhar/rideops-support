import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { diagnosisSchema, type Diagnosis } from "@/lib/contract";
import { DiagnosisResults } from "@/components/diagnosis/DiagnosisView";

const agent = (name: string, avoidable: number, reopen: number, close: number) => ({
  agent: name,
  tickets: 100,
  escalation_rate: 0.3,
  avoidable,
  avoidable_share: 0.5,
  median_first_close_h: close,
  reopen_rate: reopen,
  csat_avg: 3.8,
});

const data: Diagnosis = diagnosisSchema.parse({
  snapshot: "2026-09-30 23:59:00",
  headline: {
    tickets: 300,
    escalated: 100,
    escalation_rate: 0.33,
    avoidable: 50,
    avoidable_share: 0.5,
    bounced: 30,
    bounced_share: 0.3,
    intake_first_month: 100,
    intake_last_month: 150,
    median_close_h_escalated: 80,
    median_close_h_not_escalated: 12,
    median_close_h_fixed: 60,
    median_close_h_bounced: 120,
    open_hours_share_escalated: 0.7,
    open_hours_share_avoidable: 0.45,
    csat_escalated: 3.1,
    csat_not_escalated: 4,
    csat_bounced: 2.5,
  },
  months: [{ month: "2026-07", tickets: 100, escalation_rate: 0.35, avoidable_share: 0.5, median_close_h: 20 }],
  outcomes: [
    { outcome: "Fixed", avoidable: false, tickets: 50, median_close_h: 60, avg_handoffs: 1.1, csat_avg: 3.4 },
    { outcome: "Config issue - returned to L1", avoidable: true, tickets: 30, median_close_h: 120, avg_handoffs: 2.4, csat_avg: 2.4 },
  ],
  categories: [{ category: "Roster", tickets: 100, escalated: 50, escalation_rate: 0.5, avoidable: 25, avoidable_share: 0.5 }],
  agents: [agent("Fast Closer", 5, 0.3, 4), agent("Heavy Escalator", 30, 0.05, 12), agent("Steady", 10, 0.06, 12)],
});

describe("DiagnosisResults", () => {
  it("leads with the open-time finding and the growth in intake", () => {
    render(<DiagnosisResults data={data} />);
    expect(within(screen.getByRole("note")).getByText(/hold 70% of open ticket-hours/)).toBeInTheDocument();
    expect(screen.getByText("+50%")).toBeInTheDocument();
  });

  it("checks each interview claim against the data and names the outliers", () => {
    render(<DiagnosisResults data={data} />);
    expect(screen.getByText(/The fastest closer, Fast Closer/)).toBeInTheDocument();
    expect(screen.getByText(/One agent, Heavy Escalator, accounts for 30/)).toBeInTheDocument();
    expect(screen.getByText("2x team")).toBeInTheDocument();
    expect(screen.getByText("highest")).toBeInTheDocument();
  });

  it("flags only avoidable outcomes", () => {
    render(<DiagnosisResults data={data} />);
    const row = screen.getByRole("rowheader", { name: /Config issue/ });
    expect(within(row).getByText("avoidable")).toBeInTheDocument();
    expect(screen.getAllByText("avoidable")).toHaveLength(1);
  });
});
