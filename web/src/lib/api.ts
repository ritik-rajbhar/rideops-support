import type { z } from "zod";
import {
  backtestSchema,
  decisionResponseSchema,
  diagnosisSchema,
  precheckResponseSchema,
  ticketListSchema,
  ticketSchema,
  weeklyMetricsSchema,
  type DecisionRequest,
  type PrecheckRequest,
  type TicketSummary,
} from "@/lib/contract";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = "ApiError";
  }
}

export const isOverrideRequiredError = (error: unknown) =>
  error instanceof ApiError && error.status === 422 && /override_reason/.test(error.detail ?? "");

export const isWakingError = (error: unknown) =>
  error instanceof ApiError && error.status === 503 && error.code === "upstream_unavailable";

const MAX_WAKE_RETRIES = 4;
export const WAKE_RETRY_DELAY_MS = 2_000;

export const shouldRetry = (failureCount: number, error: unknown) =>
  isWakingError(error) && failureCount < MAX_WAKE_RETRIES;

function detailFrom(body: unknown) {
  if (typeof body !== "object" || body === null) return undefined;
  const { detail } = body as { detail?: unknown };
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return undefined;
  const messages = detail
    .map((item: unknown) =>
      typeof item === "object" && item !== null && "msg" in item ? String(item.msg) : "",
    )
    .filter(Boolean);
  return messages.length > 0 ? messages.join("; ") : undefined;
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: { method: "POST"; body: unknown; signal?: AbortSignal } | { signal?: AbortSignal },
): Promise<z.output<S>> {
  const hasBody = init !== undefined && "body" in init;
  let response: Response;
  try {
    response = await fetch(`/api/proxy/${path}`, {
      method: hasBody ? "POST" : "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "request_failed";
    throw new ApiError(response.status, code, detailFrom(body));
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(response.status, "contract_mismatch");
  return parsed.data;
}

export interface TicketFilters {
  status: "open" | "all";
  agent?: string;
  category?: string;
  priority?: string;
  q?: string;
}

const PAGE_SIZE = 100;
export const MAX_QUEUE_TICKETS = 2_000;

export interface TicketQueue {
  items: TicketSummary[];
  total: number;
  truncated: boolean;
}

/** The queue is sorted across all pages, so every page must be loaded first. */
export async function fetchQueue(filters: TicketFilters, signal?: AbortSignal): Promise<TicketQueue> {
  const byId = new Map<string, TicketSummary>();
  let offset = 0;
  let total = 0;
  while (offset < MAX_QUEUE_TICKETS) {
    const params = new URLSearchParams({
      status: filters.status,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    for (const key of ["agent", "category", "priority", "q"] as const) {
      const value = filters[key];
      if (value) params.set(key, value);
    }
    const page = await request(`tickets?${params}`, ticketListSchema, { signal });
    total = page.total;
    for (const ticket of page.items) byId.set(ticket.ticket_id, ticket);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= total) break;
  }
  return { items: [...byId.values()], total, truncated: total > byId.size };
}

const ticketPath = (id: string) => `tickets/${encodeURIComponent(id)}`;

export const fetchTicket = (id: string, signal?: AbortSignal) =>
  request(ticketPath(id), ticketSchema, { signal });

export const runPrecheck = (id: string, body: PrecheckRequest, signal?: AbortSignal) =>
  request(`${ticketPath(id)}/precheck`, precheckResponseSchema, { method: "POST", body, signal });

export const submitDecision = (id: string, body: DecisionRequest) =>
  request(`${ticketPath(id)}/decisions`, decisionResponseSchema, { method: "POST", body });

export const fetchWeekly = (signal?: AbortSignal) =>
  request("metrics/weekly", weeklyMetricsSchema, { signal });

export const fetchBacktest = (signal?: AbortSignal) =>
  request("metrics/backtest", backtestSchema, { signal });

export const fetchDiagnosis = (signal?: AbortSignal) =>
  request("metrics/diagnosis", diagnosisSchema, { signal });
