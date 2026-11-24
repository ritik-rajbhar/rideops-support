"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MAX_QUEUE_TICKETS, fetchQueue, type TicketFilters } from "@/lib/api";
import type { TicketSummary } from "@/lib/contract";
import { DATA_SNAPSHOT_MS, formatAge, sortQueue } from "@/lib/domain";
import { PriorityBadge } from "@/components/PriorityBadge";
import { EmptyNotice, QueryBoundary, buttonClass } from "@/components/QueryStates";

const VISIBLE_STEP = 100;
const GRID =
  "md:grid md:grid-cols-[3rem_6.5rem_minmax(0,1fr)_10rem_9rem_8rem_3.5rem] md:items-center md:gap-3";
const controlClass = "h-9 min-w-0 rounded border border-line bg-surface px-2 text-ink";

const uniqueSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

export function QueueRows({ tickets, now }: { tickets: TicketSummary[]; now: number }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(VISIBLE_STEP);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  const shown = tickets.slice(0, visible);
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  const move = (next: number) => {
    const index = Math.max(0, Math.min(shown.length - 1, next));
    setActive(index);
    rows.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const actions: Record<string, () => void> = {
      ArrowDown: () => move(current + 1),
      j: () => move(current + 1),
      ArrowUp: () => move(current - 1),
      k: () => move(current - 1),
      Home: () => move(0),
      End: () => move(shown.length - 1),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className="border border-line bg-surface">
      <div aria-hidden="true" className={`hidden border-b border-line px-3 py-1.5 text-xs font-medium text-ink-2 ${GRID}`}>
        <span>Pri</span>
        <span>Ticket</span>
        <span>Description</span>
        <span>Client</span>
        <span>Category</span>
        <span>Agent</span>
        <span className="text-right">Age</span>
      </div>
      <ul aria-label="Tickets" onKeyDown={onKeyDown}>
        {shown.map((ticket, index) => (
          <li key={ticket.ticket_id} className="border-b border-line last:border-b-0">
            <Link
              ref={(node) => {
                rows.current[index] = node;
              }}
              href={`/tickets/${encodeURIComponent(ticket.ticket_id)}`}
              tabIndex={index === current ? 0 : -1}
              onFocus={() => setActive(index)}
              className={`block px-3 py-2 -outline-offset-2 hover:bg-raised md:py-1.5 ${GRID}`}
            >
              <span className="float-left mr-2 md:float-none md:mr-0">
                <PriorityBadge priority={ticket.priority} />
              </span>
              <span className="font-mono text-xs text-ink-2">{ticket.ticket_id}</span>
              <span className="float-right text-ink-2 tabular-nums md:hidden">{formatAge(ticket.created_at, now)}</span>
              <span className="mt-1 block truncate md:mt-0">{ticket.description || "No description"}</span>
              <span className="truncate text-xs text-ink-2 md:text-[13px]">
                {ticket.client_name ?? "n/a"}
                {ticket.client_tier ? ` (${ticket.client_tier})` : ""}
                <span className="md:hidden"> · {ticket.category ?? "n/a"}</span>
              </span>
              <span className="hidden truncate text-[13px] text-ink-2 md:block">{ticket.category ?? "n/a"}</span>
              <span className="hidden truncate text-[13px] text-ink-2 md:block">{ticket.assigned_agent ?? "Unassigned"}</span>
              <span className="hidden text-right text-ink-2 tabular-nums md:block">{formatAge(ticket.created_at, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {tickets.length > visible ? (
        <div className="border-t border-line p-2 text-center">
          <button type="button" className={buttonClass} onClick={() => setVisible(visible + VISIBLE_STEP)}>
            Show more ({tickets.length - visible} left)
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function QueueView() {
  const router = useRouter();
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const urlQuery = params.get("q") ?? "";
  const [draft, setDraft] = useState(urlQuery);
  // Ages are measured at the data pull, not today, so the queue reads as it did on that day.
  const now = DATA_SNAPSHOT_MS;

  const filters: TicketFilters = {
    status: params.get("status") === "all" ? "all" : "open",
    agent: params.get("agent") ?? undefined,
    category: params.get("category") ?? undefined,
    priority: params.get("priority") ?? undefined,
    q: urlQuery || undefined,
  };
  const hasFilters = Boolean(filters.agent || filters.category || filters.priority || filters.q);

  const setParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    router.replace(text ? `/?${text}` : "/", { scroll: false });
  };

  useEffect(() => {
    if (draft === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (draft) next.set("q", draft);
      else next.delete("q");
      const text = next.toString();
      router.replace(text ? `/?${text}` : "/", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, urlQuery, router]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = useQuery({
    queryKey: ["tickets", filters],
    queryFn: ({ signal }) => fetchQueue(filters, signal),
  });
  const options = useQuery({
    queryKey: ["tickets", { status: filters.status }],
    queryFn: ({ signal }) => fetchQueue({ status: filters.status }, signal),
  });
  const agents = useMemo(
    () => uniqueSorted((options.data?.items ?? []).map((ticket) => ticket.assigned_agent)),
    [options.data],
  );
  const categories = useMemo(
    () => uniqueSorted((options.data?.items ?? []).map((ticket) => ticket.category)),
    [options.data],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-base font-semibold">
          {filters.status === "open" ? "Open tickets" : "All tickets"}
          {query.data ? <span className="ml-2 font-normal text-ink-2 tabular-nums">{query.data.total}</span> : null}
        </h1>
        <p className="hidden text-xs text-ink-2 md:block">
          Priority, then oldest. Ages as of the data pull, 30 Sep 2026. <kbd>/</kbd> search, <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>j</kbd> <kbd>k</kbd> move, <kbd>Enter</kbd> open
        </p>
      </div>

      <div role="search" className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        <input
          ref={searchRef}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search tickets"
          aria-label="Search tickets"
          className={`${controlClass} col-span-2 md:w-64`}
        />
        <select aria-label="Status" value={filters.status} onChange={(event) => setParams({ status: event.target.value === "all" ? "all" : "" })} className={controlClass}>
          <option value="open">Open</option>
          <option value="all">All</option>
        </select>
        <select aria-label="Priority" value={filters.priority ?? ""} onChange={(event) => setParams({ priority: event.target.value })} className={controlClass}>
          <option value="">All priorities</option>
          {["P1", "P2", "P3", "P4"].map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
        <select aria-label="Category" value={filters.category ?? ""} onChange={(event) => setParams({ category: event.target.value })} className={controlClass}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <select aria-label="Agent" value={filters.agent ?? ""} onChange={(event) => setParams({ agent: event.target.value })} className={controlClass}>
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent}>{agent}</option>
          ))}
        </select>
        {hasFilters ? (
          <button
            type="button"
            className={`${buttonClass} col-span-2 md:col-span-1`}
            onClick={() => {
              setDraft("");
              setParams({ agent: "", category: "", priority: "", q: "" });
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <QueryBoundary query={query} loading={undefined}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyNotice>{hasFilters ? "No tickets match these filters." : "No open tickets. The queue is clear."}</EmptyNotice>
          ) : (
            <>
              {data.truncated ? (
                <p role="status" className="border border-line bg-surface px-3 py-2 text-ink-2">
                  Showing {data.items.length} of {data.total}, limit {MAX_QUEUE_TICKETS}. Narrow the filters to see the rest.
                </p>
              ) : null}
              <QueueRows key={JSON.stringify(filters)} tickets={sortQueue(data.items)} now={now} />
            </>
          )
        }
      </QueryBoundary>
    </div>
  );
}
