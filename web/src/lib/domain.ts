import type { DecisionAction, TicketSummary, Verdict } from "@/lib/contract";

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

export const priorityRank = (priority: string) => PRIORITY_RANK[priority] ?? 99;

export const isP1 = (priority: string) => priority.trim().toUpperCase() === "P1";

const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

/** Highest priority first, then oldest first. */
export function sortQueue<T extends Pick<TicketSummary, "priority" | "created_at" | "ticket_id">>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort(
    (a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      timestamp(a.created_at) - timestamp(b.created_at) ||
      a.ticket_id.localeCompare(b.ticket_id),
  );
}

/** A reason is required when escalating against a non-ready verdict, except on P1. */
export function requiresOverrideReason(
  action: DecisionAction,
  verdict: Verdict | null,
  priority: string,
) {
  return action === "escalated" && verdict !== "ready_to_escalate" && !isP1(priority);
}

export const isTicketClosed = (status: string) => /clos|resolv/i.test(status);

/** The ticket file was pulled at this time (IST, stored without an offset like the data). */
export const DATA_SNAPSHOT_MS = Date.parse("2026-09-30T23:59:00");

export function formatAge(createdAt: string, now: number) {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return "n/a";
  const minutes = Math.max(0, Math.floor((now - created) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rates may arrive as a 0-1 fraction; values above 1 are treated as percentages. */
export function formatRate(value: number | null, digits = 1) {
  if (value === null) return "n/a";
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(digits)}%`;
}

/** Scales a whole series together, so a low percentage is not read as a fraction. */
export function toPercentSeries(values: (number | null)[]) {
  const isFraction = values.every((value) => value === null || Math.abs(value) <= 1);
  return values.map((value) => (value === null ? null : isFraction ? value * 100 : value));
}

export const humanize = (value: string) => {
  const text = value.replace(/_/g, " ").replace(/\bl1\b/gi, "L1");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
