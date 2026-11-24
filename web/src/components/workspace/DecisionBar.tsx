"use client";

import { useState, type FormEvent } from "react";
import { ApiError, isOverrideRequiredError, isWakingError } from "@/lib/api";
import type { DecisionAction, DecisionRequest, Verdict } from "@/lib/contract";
import { isP1, requiresOverrideReason } from "@/lib/domain";
import { useAgentName } from "@/lib/useAgentName";
import { buttonClass } from "@/components/QueryStates";
import { verdictLabel } from "@/components/workspace/PrecheckPanel";

const ACTION_LABEL: Record<DecisionAction, string> = {
  resolved_at_l1: "Resolve at L1",
  requested_info: "Request info",
  escalated: "Escalate",
};
const DONE_LABEL: Record<DecisionAction, string> = {
  resolved_at_l1: "Resolved at L1",
  requested_info: "Info requested",
  escalated: "Escalated to engineering",
};
const MAX_REASON = 200;
const P1_FALLBACK_AGENT = "unidentified";

const primaryClass =
  "inline-flex min-h-9 items-center justify-center rounded border border-accent bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function failureMessage(error: unknown) {
  if (isWakingError(error)) {
    return "The server did not respond, and this may or may not have saved. Check the ticket before trying again.";
  }
  if (error instanceof ApiError && error.detail) return error.detail;
  return "Could not record this decision. Try again.";
}

export function DecisionBar({
  priority,
  verdict,
  evidence,
  checking = false,
  submitting,
  error,
  recorded,
  onSubmit,
}: {
  priority: string;
  verdict: Verdict | null;
  evidence: Record<string, boolean>;
  /** The verdict is being recomputed, so a reason requirement may be about to change. */
  checking?: boolean;
  submitting: boolean;
  error: unknown;
  recorded: DecisionAction | null;
  onSubmit: (decision: DecisionRequest, options: { onError: (error: unknown) => void }) => void;
}) {
  const [agent, setAgent] = useAgentName();
  const [pending, setPending] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  // Holds the verdict the server demanded a reason for; a new verdict clears it.
  const [serverRequired, setServerRequired] = useState<{ verdict: Verdict | null } | null>(null);
  const fastPath = isP1(priority);
  const serverNeedsReason = serverRequired !== null && serverRequired.verdict === verdict;
  const reasonRequired = (action: DecisionAction) =>
    requiresOverrideReason(action, verdict, priority) || (action === "escalated" && serverNeedsReason);

  if (recorded) {
    return (
      <p role="status" className="border border-line bg-surface px-3 py-2 font-medium">
        Recorded: {DONE_LABEL[recorded]}.
      </p>
    );
  }

  const needsReason = pending ? reasonRequired(pending) : false;

  const send = (action: DecisionAction) => {
    const trimmedAgent = agent.trim();
    const trimmedReason = reason.trim();
    const reasonNeeded = reasonRequired(action);
    const agentMissing = !trimmedAgent && !(fastPath && action === "escalated");
    if (agentMissing || (reasonNeeded && !trimmedReason)) {
      setShowMissing(true);
      return;
    }
    onSubmit(
      {
        action,
        verdict_shown: verdict,
        evidence,
        agent: trimmedAgent || P1_FALLBACK_AGENT,
        ...(reasonNeeded ? { override_reason: trimmedReason } : {}),
      },
      {
        onError: (failure) => {
          if (!isOverrideRequiredError(failure)) return;
          setServerRequired({ verdict });
          setPending("escalated");
        },
      },
    );
  };

  const choose = (action: DecisionAction) => {
    setShowMissing(false);
    if (fastPath && action === "escalated" && !serverNeedsReason) send(action);
    else setPending(action);
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (pending) send(pending);
  };

  const agentError = showMissing && !agent.trim();
  const reasonError = showMissing && needsReason && !reason.trim();
  const escalateIsPrimary = fastPath || verdict === "ready_to_escalate";

  return (
    <div className="sticky bottom-0 z-10 space-y-2 border border-line bg-surface p-2 lg:static">
      <div className="flex items-center gap-2">
        <label htmlFor="agent-name" className="shrink-0 text-xs text-ink-2">
          Acting as
        </label>
        <input
          id="agent-name"
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          maxLength={80}
          placeholder="Your name"
          autoComplete="name"
          aria-invalid={agentError || undefined}
          className={`h-8 min-w-0 flex-1 rounded border bg-surface px-2 ${agentError ? "border-critical" : "border-line"}`}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" className={buttonClass} disabled={submitting} aria-pressed={pending === "resolved_at_l1"} onClick={() => choose("resolved_at_l1")}>
          Resolve at L1
        </button>
        <button type="button" className={buttonClass} disabled={submitting} aria-pressed={pending === "requested_info"} onClick={() => choose("requested_info")}>
          Request info
        </button>
        <button type="button" className={escalateIsPrimary ? primaryClass : buttonClass} disabled={submitting} aria-pressed={pending === "escalated"} onClick={() => choose("escalated")}>
          {fastPath ? "Escalate now" : "Escalate"}
        </button>
      </div>

      {pending ? (
        <form onSubmit={confirm} onKeyDown={(event) => event.key === "Escape" && setPending(null)} className="space-y-1.5 border-t border-line pt-2">
          {needsReason ? (
            <div>
              <label htmlFor="override-reason" className="mb-0.5 block text-[13px] font-medium">
                {serverNeedsReason
                  ? "The server needs a one-line reason for this escalation."
                  : verdict
                  ? `The check advised "${verdictLabel(verdict)}". Why escalate anyway?`
                  : "The check is unavailable. Why escalate?"}
              </label>
              <input
                id="override-reason"
                autoFocus
                value={reason}
                maxLength={MAX_REASON}
                onChange={(event) => setReason(event.target.value)}
                placeholder="One line is enough"
                aria-invalid={reasonError || undefined}
                className={`h-9 w-full rounded border bg-surface px-2 ${reasonError ? "border-critical" : "border-line"}`}
              />
            </div>
          ) : (
            <p className="text-[13px]">Record “{ACTION_LABEL[pending]}” on this ticket?</p>
          )}
          {showMissing ? (
            <p role="alert" className="text-[13px] text-critical-text">
              {agentError ? "Add your name. " : ""}
              {reasonError ? "Add a one-line reason." : ""}
            </p>
          ) : null}
          <div className="flex justify-end gap-1.5">
            <button type="button" className={buttonClass} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="submit" className={primaryClass} disabled={submitting || (checking && !fastPath)}>
              {submitting ? "Saving" : checking && !fastPath ? "Re-checking" : `Confirm: ${ACTION_LABEL[pending]}`}
            </button>
          </div>
        </form>
      ) : null}

      {!pending && showMissing && agentError ? (
        <p role="alert" className="text-[13px] text-critical-text">Add your name.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-critical-text">{failureMessage(error)}</p>
      ) : null}
    </div>
  );
}
