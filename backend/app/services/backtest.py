"""Replay September escalations using only knowledge available at each ticket's creation."""

from collections import Counter
from collections.abc import Sequence
from datetime import datetime

from app.config import BACKTEST_START, SNAPSHOT_AT
from app.domain.models import (
    AVOIDABLE_OUTCOMES,
    L1_FIXABLE_OUTCOMES,
    OUTCOME_DUPLICATE,
    OUTCOME_FIXED,
    OUTCOME_INSUFFICIENT,
    PRIORITY_P1,
    TicketRecord,
    TriageView,
    Verdict,
)
from app.services.precheck import (
    DEFAULT_POLICY,
    ORIGINAL_POLICY,
    PrecheckPolicy,
    run_precheck,
)
from app.services.retrieval import KnowledgeBase

VERDICT_TARGETS: dict[Verdict, frozenset[str]] = {
    Verdict.LIKELY_KNOWN_ISSUE: frozenset({OUTCOME_DUPLICATE}),
    Verdict.TRY_L1_FIX: L1_FIXABLE_OUTCOMES,
    Verdict.NEEDS_INFO: frozenset({OUTCOME_INSUFFICIENT}),
    Verdict.READY_TO_ESCALATE: frozenset({OUTCOME_FIXED}),
}
ASSUMPTIONS = (
    "Checklist evidence was not recorded historically, so replay assumes it was complete.",
    "needs_info therefore cannot fire in replay and its precision is not measured.",
    "Rule thresholds were chosen on August escalations and were not tuned on September.",
    "Labels are the recorded eng_outcome, including escalations still open at snapshot.",
)

METHODOLOGY_NOTE = (
    "try_l1_fix was demoted to a non-blocking hint after its weak September precision was "
    "seen. No threshold was tuned on September, but this design change was informed by it, "
    "so the revised result is not a clean holdout. original_pre_change is the first replay; "
    "its thresholds were set on August, but full-period category counts were seen in profiling, "
    "so it is not perfectly blind either."
)


def _share(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _lift(precision: float | None, base_rate: float | None) -> float | None:
    return round(precision / base_rate, 2) if precision is not None and base_rate else None


def run_backtest(
    tickets: Sequence[TicketRecord],
    knowledge: KnowledgeBase,
    start: datetime = BACKTEST_START,
    end: datetime = SNAPSHOT_AT,
) -> dict[str, object]:
    revised = _replay(tickets, knowledge, DEFAULT_POLICY, start, end)
    original = _replay(tickets, knowledge, ORIGINAL_POLICY, start, end)
    return {
        **revised,
        "result_label": "revised_not_clean_holdout",
        "clean_holdout": False,
        "methodology_note": METHODOLOGY_NOTE,
        "original_pre_change": {
            **original,
            "result_label": "original_pre_change",
            "clean_holdout": False,
        },
    }


def _replay(
    tickets: Sequence[TicketRecord],
    knowledge: KnowledgeBase,
    policy: PrecheckPolicy,
    start: datetime,
    end: datetime,
) -> dict[str, object]:
    cohort = sorted(
        (
            t
            for t in tickets
            if t.escalated_to_eng and t.eng_outcome and start <= t.created_at <= end
        ),
        key=lambda ticket: (ticket.created_at, ticket.ticket_id),
    )
    verdicts = [
        (t, run_precheck(TriageView.from_ticket(t), None, knowledge, policy).verdict)
        for t in cohort
    ]
    counts = Counter(verdict for _, verdict in verdicts)

    precision: dict[str, dict[str, object]] = {}
    for verdict, targets in VERDICT_TARGETS.items():
        flagged = [t for t, shown in verdicts if shown is verdict]
        correct = sum(t.eng_outcome in targets for t in flagged)
        base = sum(t.eng_outcome in targets for t in cohort)
        verdict_precision = _share(correct, len(flagged))
        base_rate = _share(base, len(cohort))
        precision[verdict.value] = {
            "flagged": len(flagged),
            "correct": correct,
            "precision": verdict_precision,
            "base_rate": base_rate,
            "lift": _lift(verdict_precision, base_rate),
            "target_outcomes": sorted(targets),
        }

    held = [(t, shown) for t, shown in verdicts if shown is not Verdict.READY_TO_ESCALATE]
    fixed = [t for t in cohort if t.eng_outcome == OUTCOME_FIXED]
    delayed = [(t, shown) for t, shown in held if t.eng_outcome == OUTCOME_FIXED]
    p1 = [(t, shown) for t, shown in verdicts if t.priority == PRIORITY_P1]
    avoidable_total = sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in cohort)
    avoidable_held = sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t, _ in held)

    return {
        "window": {"start": start.isoformat(sep=" "), "end": end.isoformat(sep=" ")},
        "policy_version": policy.version,
        "escalations": len(cohort),
        "flagged_by_verdict": {verdict.value: counts[verdict] for verdict in Verdict},
        "precision_by_verdict": precision,
        "held_for_review": {
            "count": len(held),
            "avoidable": avoidable_held,
            "precision_avoidable": _share(avoidable_held, len(held)),
            "base_rate_avoidable": _share(avoidable_total, len(cohort)),
            "recall_avoidable": _share(avoidable_held, avoidable_total),
        },
        "fixed_bugs_delayed": {
            "count": len(delayed),
            "fixed_total": len(fixed),
            "rate": _share(len(delayed), len(fixed)),
            "by_verdict": {
                verdict.value: count
                for verdict, count in sorted(Counter(shown for _, shown in delayed).items())
            },
        },
        "p1": {
            "total": len(p1),
            "misses": sum(shown is not Verdict.READY_TO_ESCALATE for _, shown in p1),
        },
        "assumptions": list(ASSUMPTIONS),
    }
