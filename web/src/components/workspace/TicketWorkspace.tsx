"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchTicket, runPrecheck, submitDecision } from "@/lib/api";
import type { ChecklistItem, DecisionAction, DecisionRequest, Ticket } from "@/lib/contract";
import { formatDateTime, humanize, isP1, isTicketClosed } from "@/lib/domain";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ErrorNotice, LoadingRows, QueryBoundary } from "@/components/QueryStates";
import { DecisionBar } from "@/components/workspace/DecisionBar";
import { P1FastPath, PrecheckPanel } from "@/components/workspace/PrecheckPanel";

function TicketDetails({ ticket }: { ticket: Ticket }) {
  const fields: [string, string][] = [
    ["Client", `${ticket.client_name ?? "n/a"}${ticket.client_tier ? ` (${ticket.client_tier})` : ""}`],
    ["Category", ticket.category ?? "n/a"],
    ["Channel", ticket.channel ?? "n/a"],
    ["Agent", ticket.assigned_agent ?? "Unassigned"],
    ["Status", humanize(ticket.status)],
    ["Created", formatDateTime(ticket.created_at)],
    ["Sent to engineering", ticket.escalated_to_eng ? "Yes" : "No"],
  ];
  // Post-triage fields are null on open tickets, so these rows appear only on history.
  const optional: [string, string | null][] = [
    ["Client ID", ticket.client_id],
    ["First response", ticket.first_response_at && formatDateTime(ticket.first_response_at)],
    ["Engineering ticket", ticket.eng_ticket_id],
    ["Engineering handoffs", ticket.eng_handoffs === null ? null : String(ticket.eng_handoffs)],
    ["Engineering outcome", ticket.eng_outcome && humanize(ticket.eng_outcome)],
    ["First closed", ticket.first_closed_at && formatDateTime(ticket.first_closed_at)],
    ["Final closed", ticket.final_closed_at && formatDateTime(ticket.final_closed_at)],
    ["Reopens", ticket.reopen_count === null ? null : String(ticket.reopen_count)],
    ["CSAT", ticket.csat_score === null ? null : String(ticket.csat_score)],
  ];
  for (const [label, value] of optional) {
    if (value !== null) fields.push([label, value]);
  }
  return (
    <article className="border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <PriorityBadge priority={ticket.priority} />
        <h1 className="font-mono text-sm font-semibold">{ticket.ticket_id}</h1>
      </div>
      <p className="mt-2 text-[15px] break-words whitespace-pre-wrap">{ticket.description || "No description"}</p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 border-t border-line pt-2 text-[13px]">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-2">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function CheckColumn({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const id = ticket.ticket_id;
  const fastPath = isP1(ticket.priority);
  const [evidence, setEvidence] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [sentNote, setSentNote] = useState("");
  const [recorded, setRecorded] = useState<DecisionAction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSentNote(note.trim()), 600);
    return () => clearTimeout(timer);
  }, [note]);

  const precheck = useQuery({
    queryKey: ["precheck", id, evidence, sentNote],
    queryFn: ({ signal }) =>
      runPrecheck(id, { evidence, ...(sentNote ? { note: sentNote } : {}) }, signal),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 60_000,
  });

  const decision = useMutation({
    mutationFn: (body: DecisionRequest) => submitDecision(id, body),
    onSuccess: async (_result, body) => {
      setRecorded(body.action);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["ticket", id] }),
      ]);
    },
  });

  const toggle = (checklist: ChecklistItem[], key: string, done: boolean) => {
    setEvidence({
      ...Object.fromEntries(checklist.map((item) => [item.key, item.done])),
      [key]: done,
    });
  };

  const verdict = precheck.isError ? null : (precheck.data?.verdict ?? null);
  const noActionNeeded = recorded === null && (isTicketClosed(ticket.status) || ticket.escalated_to_eng);
  const actions = noActionNeeded ? (
    <p role="status" className="border border-line bg-surface px-3 py-2 text-ink-2">
      {ticket.escalated_to_eng ? "Already with engineering." : "This ticket is closed."} No action needed.
    </p>
  ) : (
    <DecisionBar
      priority={ticket.priority}
      verdict={verdict}
      evidence={evidence}
      checking={precheck.isFetching}
      submitting={decision.isPending}
      error={decision.error}
      recorded={recorded}
      onSubmit={(body, options) => decision.mutate(body, options)}
    />
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="text-sm font-semibold">Pre-Escalation Check</h2>
        <p className="text-xs text-ink-2">Advisory only. You decide, and can always escalate.</p>
      </div>

      {fastPath ? <P1FastPath /> : null}
      {fastPath ? actions : null}

      {precheck.isError ? (
        <ErrorNotice error={precheck.error} onRetry={() => void precheck.refetch()} />
      ) : (
        <QueryBoundary query={precheck} loading={<LoadingRows rows={4} />}>
          {(data) => {
            const checklist = data.checklist.map((item) => ({
              ...item,
              done: evidence[item.key] ?? item.done,
            }));
            return (
              <PrecheckPanel
                data={{ ...data, checklist }}
                isP1Ticket={fastPath}
                updating={precheck.isFetching}
                onToggle={(key, done) => toggle(checklist, key, done)}
              />
            );
          }}
        </QueryBoundary>
      )}

      <div className="border border-line bg-surface px-3 py-2">
        <label htmlFor="precheck-note" className="mb-1 block text-xs font-semibold text-ink-2">
          Note for the check (optional)
        </label>
        <textarea
          id="precheck-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded border border-line bg-surface px-2 py-1"
        />
      </div>

      {fastPath ? null : actions}
    </div>
  );
}

export function TicketWorkspace({ id }: { id: string }) {
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: ({ signal }) => fetchTicket(id, signal),
  });
  return (
    <div className="space-y-2">
      <Link href="/" className="text-[13px] text-ink-2 hover:text-ink">
        ← Back to queue
      </Link>
      <QueryBoundary query={ticket} loading={<LoadingRows rows={8} />}>
        {(data) => (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
            <TicketDetails ticket={data} />
            <CheckColumn key={data.ticket_id} ticket={data} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
