/**
 * Every backend response and request shape lives here so the frontend can be
 * reconciled against the API in one place.
 */
import { z } from "zod";

const nullableString = z.string().nullish().transform((value) => value ?? null);
const nullableNumber = z.number().nullish().transform((value) => value ?? null);

/** `try_l1_fix` is no longer emitted but stays parseable for older records. */
export const VERDICTS = [
  "likely_known_issue",
  "try_l1_fix",
  "needs_info",
  "ready_to_escalate",
] as const;
export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

export const confidenceBandSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;

export const DECISION_ACTIONS = ["escalated", "resolved_at_l1", "requested_info"] as const;
export const decisionActionSchema = z.enum(DECISION_ACTIONS);
export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const healthSchema = z.looseObject({});

export const ticketSummarySchema = z.looseObject({
  ticket_id: z.string(),
  created_at: z.string(),
  channel: nullableString,
  client_name: nullableString,
  client_tier: nullableString,
  category: nullableString,
  priority: z.string().transform((value) => value.trim().toUpperCase()),
  description: z.string().nullish().transform((value) => value ?? ""),
  assigned_agent: nullableString,
  status: z.string(),
  escalated_to_eng: z.boolean(),
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketListSchema = z.object({
  items: z.array(ticketSummarySchema),
  total: z.number().int().nonnegative(),
});
export type TicketList = z.infer<typeof ticketListSchema>;

/** Post-triage fields are null while a ticket is open. */
export const ticketSchema = ticketSummarySchema.extend({
  client_id: nullableString,
  first_response_at: nullableString,
  eng_ticket_id: nullableString,
  eng_handoffs: nullableNumber,
  eng_outcome: nullableString,
  first_closed_at: nullableString,
  final_closed_at: nullableString,
  reopen_count: nullableNumber,
  csat_score: nullableNumber,
});
export type Ticket = z.infer<typeof ticketSchema>;

export const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const similarTicketSchema = z.object({
  ticket_id: z.string(),
  description: z.string().nullish().transform((value) => value ?? ""),
  category: nullableString,
  eng_outcome: nullableString,
  similarity: z.number(),
  closed_at: nullableString,
});
export type SimilarTicket = z.infer<typeof similarTicketSchema>;

export const precheckResponseSchema = z.object({
  ticket_id: z.string(),
  verdict: verdictSchema,
  confidence_band: confidenceBandSchema,
  reasons: z.array(z.string()),
  checklist: z.array(checklistItemSchema),
  similar: z.array(similarTicketSchema),
  suggested_action: z.string().nullish().transform((value) => value ?? ""),
  override_allowed: z.literal(true),
});
export type PrecheckResponse = z.infer<typeof precheckResponseSchema>;

export interface PrecheckRequest {
  evidence: Record<string, boolean>;
  note?: string;
}

export interface DecisionRequest {
  action: DecisionAction;
  /** Null only when the check could not be loaded, so no verdict was shown. */
  verdict_shown: Verdict | null;
  /** The server recomputes the verdict from this map. */
  evidence: Record<string, boolean>;
  override_reason?: string;
  agent: string;
}

export const decisionResponseSchema = z.looseObject({});

export const weekSchema = z.object({
  week_start: z.string(),
  partial: z.boolean(),
  arrivals: nullableNumber,
  closures: nullableNumber,
  net_flow: nullableNumber,
  avg_open_7d: nullableNumber,
  avoidable_escalation_share: nullableNumber,
  reopen_rate: nullableNumber,
  p1p2_median_close_h: nullableNumber,
  csat_avg: nullableNumber,
  csat_response_rate: nullableNumber,
});
export type WeekMetrics = z.infer<typeof weekSchema>;

export const weeklyMetricsSchema = z.object({ weeks: z.array(weekSchema) });
export type WeeklyMetrics = z.infer<typeof weeklyMetricsSchema>;

const backtestVerdictSchema = z.looseObject({
  flagged: z.number(),
  correct: z.number(),
  precision: nullableNumber,
  base_rate: nullableNumber,
  lift: nullableNumber,
  target_outcomes: z.array(z.string()).default([]),
});

const backtestRunSchema = z.looseObject({
  window: z.looseObject({ start: z.string(), end: z.string() }).nullish(),
  policy_version: nullableString,
  escalations: nullableNumber,
  flagged_by_verdict: z.record(z.string(), z.number()).default({}),
  precision_by_verdict: z.record(z.string(), backtestVerdictSchema).default({}),
  held_for_review: z
    .looseObject({
      count: z.number(),
      avoidable: z.number(),
      precision_avoidable: nullableNumber,
      base_rate_avoidable: nullableNumber,
      recall_avoidable: nullableNumber,
    })
    .nullish(),
  fixed_bugs_delayed: z
    .looseObject({
      count: z.number(),
      fixed_total: nullableNumber,
      rate: nullableNumber,
      by_verdict: z.record(z.string(), z.number()).default({}),
    })
    .nullish(),
  p1: z.looseObject({ total: nullableNumber, misses: z.number() }).nullish(),
  assumptions: z.array(z.string()).default([]),
  // Required: a result without its label must not render as a plain result.
  result_label: z.string().min(1),
  clean_holdout: z.boolean(),
});
export type BacktestRun = z.infer<typeof backtestRunSchema>;

export const backtestSchema = backtestRunSchema.extend({
  methodology_note: z.string().min(1),
  original_pre_change: backtestRunSchema.nullish(),
});
export type Backtest = z.infer<typeof backtestSchema>;

const diagnosisHeadlineSchema = z.looseObject({
  tickets: z.number(),
  escalated: z.number(),
  escalation_rate: nullableNumber,
  avoidable: z.number(),
  avoidable_share: nullableNumber,
  bounced: z.number(),
  bounced_share: nullableNumber,
  intake_first_month: nullableNumber,
  intake_last_month: nullableNumber,
  median_close_h_escalated: nullableNumber,
  median_close_h_not_escalated: nullableNumber,
  median_close_h_fixed: nullableNumber,
  median_close_h_bounced: nullableNumber,
  open_hours_share_escalated: nullableNumber,
  open_hours_share_avoidable: nullableNumber,
  csat_escalated: nullableNumber,
  csat_not_escalated: nullableNumber,
  csat_bounced: nullableNumber,
});

export const diagnosisSchema = z.object({
  snapshot: z.string(),
  headline: diagnosisHeadlineSchema,
  months: z.array(
    z.looseObject({
      month: z.string(),
      tickets: z.number(),
      escalation_rate: nullableNumber,
      avoidable_share: nullableNumber,
      median_close_h: nullableNumber,
    }),
  ),
  outcomes: z.array(
    z.looseObject({
      outcome: z.string(),
      avoidable: z.boolean(),
      tickets: z.number(),
      median_close_h: nullableNumber,
      avg_handoffs: nullableNumber,
      csat_avg: nullableNumber,
    }),
  ),
  categories: z.array(
    z.looseObject({
      category: z.string(),
      tickets: z.number(),
      escalated: z.number(),
      escalation_rate: nullableNumber,
      avoidable: z.number(),
      avoidable_share: nullableNumber,
    }),
  ),
  agents: z.array(
    z.looseObject({
      agent: z.string(),
      tickets: z.number(),
      escalation_rate: nullableNumber,
      avoidable: z.number(),
      avoidable_share: nullableNumber,
      median_first_close_h: nullableNumber,
      reopen_rate: nullableNumber,
      csat_avg: nullableNumber,
    }),
  ),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;
