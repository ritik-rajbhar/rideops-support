"use client";

import type { ChecklistItem, PrecheckResponse, SimilarTicket, Verdict } from "@/lib/contract";
import { formatDateTime, humanize } from "@/lib/domain";
import { Icon, type IconName } from "@/components/Icon";

const VERDICT_COPY: Record<Verdict, { label: string; lead: string; icon: IconName; tone: string }> = {
  likely_known_issue: {
    label: "Likely a known issue",
    lead: "Past tickets suggest this may not need engineering.",
    icon: "info",
    tone: "text-warning",
  },
  try_l1_fix: {
    label: "Try an L1 fix first",
    lead: "An L1 fix may resolve this without engineering.",
    icon: "wrench",
    tone: "text-serious",
  },
  needs_info: {
    label: "More information needed",
    lead: "Engineering would likely need more detail to act on this.",
    icon: "alert",
    tone: "text-serious",
  },
  ready_to_escalate: {
    label: "Ready to escalate",
    lead: "The evidence supports sending this to engineering.",
    icon: "check",
    tone: "text-good",
  },
};

export const verdictLabel = (verdict: Verdict) => VERDICT_COPY[verdict].label;

const sectionTitle = "mb-1 text-xs font-semibold text-ink-2";

export function P1FastPath() {
  return (
    <section aria-label="P1 fast path" className="border-l-2 border-critical bg-surface px-3 py-2">
      <p className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Icon name="bolt" className="text-critical" />
        P1 fast path: escalate now
      </p>
      <p className="text-ink-2">Evidence is optional. This check never advises holding a P1.</p>
    </section>
  );
}

function VerdictSummary({ data, updating }: { data: PrecheckResponse; updating: boolean }) {
  const copy = VERDICT_COPY[data.verdict];
  return (
    <section aria-label="Advice" aria-busy={updating} className="bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <Icon name={copy.icon} className={copy.tone} />
        <h2 className="text-[15px] font-semibold">{copy.label}</h2>
        <span className="text-xs text-ink-2">{humanize(data.confidence_band)} confidence</span>
        {updating ? <span role="status" className="ml-auto text-xs text-ink-2">Re-checking</span> : null}
      </div>
      <p className="text-ink-2">{copy.lead}</p>
      {data.suggested_action ? (
        <p className="mt-1">
          <span className="font-medium">Suggested: </span>
          {data.suggested_action}
        </p>
      ) : null}
      {data.reasons.length > 0 ? (
        <>
          <h3 className={`${sectionTitle} mt-2`}>Why</h3>
          <ul className="list-disc space-y-0.5 pl-4">
            {data.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Checklist({
  items,
  fastPath,
  onToggle,
}: {
  items: ChecklistItem[];
  fastPath: boolean;
  onToggle: (key: string, done: boolean) => void;
}) {
  return (
    <section aria-label="Evidence checklist" className="bg-surface px-3 py-2">
      <h3 className={sectionTitle}>Evidence{fastPath ? " (optional)" : ""}</h3>
      {items.length === 0 ? <p className="text-ink-2">No evidence needed for this ticket.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(event) => onToggle(item.key, event.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.required && !fastPath ? <span className="text-xs text-ink-2">Required</span> : null}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SimilarTickets({ items }: { items: SimilarTicket[] }) {
  return (
    <section aria-label="Similar past tickets" className="bg-surface px-3 py-2">
      <h3 className={sectionTitle}>Similar past tickets</h3>
      {items.length === 0 ? <p className="text-ink-2">No similar past tickets found.</p> : null}
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.ticket_id} className="py-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-2">
              <span className="font-mono">{item.ticket_id}</span>
              <span>{item.category ?? "n/a"}</span>
              <span className="tabular-nums">{Math.round((item.similarity <= 1 ? item.similarity * 100 : item.similarity))}% match</span>
              <span className="ml-auto">Closed {formatDateTime(item.closed_at)}</span>
            </div>
            <p className="line-clamp-2">{item.description}</p>
            <p className="text-[13px]">
              <span className="text-ink-2">Engineering outcome: </span>
              {item.eng_outcome ? humanize(item.eng_outcome) : "Not recorded"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrecheckPanel({
  data,
  isP1Ticket,
  updating,
  onToggle,
}: {
  data: PrecheckResponse;
  isP1Ticket: boolean;
  updating: boolean;
  onToggle: (key: string, done: boolean) => void;
}) {
  return (
    <div className="space-y-px bg-line">
      {isP1Ticket ? null : <VerdictSummary data={data} updating={updating} />}
      <Checklist items={data.checklist} fastPath={isP1Ticket} onToggle={onToggle} />
      <SimilarTickets items={data.similar} />
    </div>
  );
}
