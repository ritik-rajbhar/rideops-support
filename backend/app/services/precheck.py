"""Advisory pre-escalation verdicts. Reads only triage fields and prior outcomes."""

from collections import Counter
from dataclasses import dataclass
from enum import StrEnum

from app.domain.models import (
    L1_FIXABLE_OUTCOMES,
    OUTCOME_DUPLICATE,
    PRIORITY_P1,
    ConfidenceBand,
    TriageView,
    Verdict,
)
from app.services.checklist import ChecklistState, evaluate, items_for, missing_required
from app.services.retrieval import KnowledgeBase, Match

THIN_EVIDENCE_NOTE = (
    "Ticket descriptions are short templates, so text matches are thin evidence; "
    "this result combines them with category outcome history."
)


class Rule(StrEnum):
    P1_FAST_PATH = "P1_FAST_PATH"
    KNOWN_ISSUE_HISTORY = "KNOWN_ISSUE_HISTORY"
    MISSING_EVIDENCE = "MISSING_EVIDENCE"
    L1_FIX_HISTORY = "L1_FIX_HISTORY"
    NO_HOLD_SIGNAL = "NO_HOLD_SIGNAL"


@dataclass(frozen=True, slots=True)
class PrecheckPolicy:
    version: str = "2026-11.v2"
    similarity_floor: float = 0.5
    shrinkage: float = 5.0
    min_category_history: int = 10
    min_outcome_support: int = 3
    known_issue_threshold: float = 0.3
    l1_fix_threshold: float = 0.4
    top_k: int = 5
    l1_fix_holds: bool = False


DEFAULT_POLICY = PrecheckPolicy()
ORIGINAL_POLICY = PrecheckPolicy(version="2026-11.v1", l1_fix_holds=True)
L1_HINT = (
    "Hint (non-blocking): similar prior escalations were often config or how-to issues; "
    "a quick L1 check may help."
)


@dataclass(frozen=True, slots=True)
class Signals:
    match_counts: Counter[str]
    category_counts: Counter[str]
    known_issue_rate: float
    l1_fix_rate: float
    top_similarity: float

    @property
    def match_total(self) -> int:
        return sum(self.match_counts.values())

    @property
    def category_total(self) -> int:
        return sum(self.category_counts.values())


@dataclass(frozen=True, slots=True)
class PrecheckResult:
    ticket_id: str
    verdict: Verdict
    rule: Rule
    confidence_band: ConfidenceBand
    reasons: list[str]
    checklist: list[ChecklistState]
    similar: list[Match]
    suggested_action: str
    override_allowed: bool = True


def _blended_rate(
    outcomes: frozenset[str],
    matches: Counter[str],
    category: Counter[str],
    shrinkage: float,
) -> float:
    category_total = sum(category.values())
    if category_total == 0:
        return 0.0
    category_rate = sum(category[outcome] for outcome in outcomes) / category_total
    match_hits = sum(matches[outcome] for outcome in outcomes)
    return (match_hits + shrinkage * category_rate) / (sum(matches.values()) + shrinkage)


def build_signals(
    matches: list[Match], category_counts: Counter[str], policy: PrecheckPolicy
) -> Signals:
    match_counts = Counter(match.entry.eng_outcome for match in matches)
    return Signals(
        match_counts=match_counts,
        category_counts=category_counts,
        known_issue_rate=_blended_rate(
            frozenset({OUTCOME_DUPLICATE}), match_counts, category_counts, policy.shrinkage
        ),
        l1_fix_rate=_blended_rate(
            L1_FIXABLE_OUTCOMES, match_counts, category_counts, policy.shrinkage
        ),
        top_similarity=matches[0].similarity if matches else 0.0,
    )


def has_l1_hint(signals: Signals, policy: PrecheckPolicy = DEFAULT_POLICY) -> bool:
    l1_support = sum(signals.category_counts[outcome] for outcome in L1_FIXABLE_OUTCOMES)
    return (
        signals.category_total >= policy.min_category_history
        and l1_support >= policy.min_outcome_support
        and signals.l1_fix_rate >= policy.l1_fix_threshold
    )


def decide(
    priority: str,
    missing_keys: list[str] | None,
    signals: Signals,
    policy: PrecheckPolicy = DEFAULT_POLICY,
) -> tuple[Verdict, Rule]:
    """Pick a verdict. missing_keys=None means evidence was not recorded (replay)."""
    if priority == PRIORITY_P1:
        return Verdict.READY_TO_ESCALATE, Rule.P1_FAST_PATH

    has_history = signals.category_total >= policy.min_category_history
    duplicates = signals.category_counts[OUTCOME_DUPLICATE]
    if (
        has_history
        and duplicates >= policy.min_outcome_support
        and signals.known_issue_rate >= policy.known_issue_threshold
    ):
        return Verdict.LIKELY_KNOWN_ISSUE, Rule.KNOWN_ISSUE_HISTORY

    if missing_keys:
        return Verdict.NEEDS_INFO, Rule.MISSING_EVIDENCE

    if policy.l1_fix_holds and has_l1_hint(signals, policy):
        return Verdict.TRY_L1_FIX, Rule.L1_FIX_HISTORY
    return Verdict.READY_TO_ESCALATE, Rule.NO_HOLD_SIGNAL


def confidence_band(signals: Signals) -> ConfidenceBand:
    if signals.match_total >= 5 and signals.top_similarity >= 0.8 and signals.category_total >= 20:
        return ConfidenceBand.HIGH
    if signals.match_total >= 2 or signals.category_total >= 20:
        return ConfidenceBand.MEDIUM
    return ConfidenceBand.LOW


def _format_counts(counts: Counter[str]) -> str:
    if not counts:
        return "none"
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ", ".join(f"{outcome}: {count}" for outcome, count in ordered)


_RULE_REASONS = {
    Rule.P1_FAST_PATH: "Rule P1_FAST_PATH: P1 tickets are never held; any gaps are warnings only.",
    Rule.KNOWN_ISSUE_HISTORY: (
        "Rule KNOWN_ISSUE_HISTORY: similar prior escalations often closed as duplicates."
    ),
    Rule.MISSING_EVIDENCE: "Rule MISSING_EVIDENCE: required checklist items are not complete.",
    Rule.L1_FIX_HISTORY: (
        "Rule L1_FIX_HISTORY: similar prior escalations were often config or how-to issues."
    ),
    Rule.NO_HOLD_SIGNAL: "Rule NO_HOLD_SIGNAL: required evidence is complete and no hold signal.",
}

_SUGGESTED_ACTIONS = {
    Rule.P1_FAST_PATH: "Escalate now. Add any missing evidence to the engineering ticket after.",
    Rule.KNOWN_ISSUE_HISTORY: (
        "Compare with the matched tickets. Link the known issue if it fits; otherwise escalate."
    ),
    Rule.MISSING_EVIDENCE: "Collect the missing checklist items, then run the check again.",
    Rule.L1_FIX_HISTORY: "Try the config or how-to fix at L1. Escalate if it does not resolve.",
    Rule.NO_HOLD_SIGNAL: "Escalate with the completed checklist attached.",
}


def run_precheck(
    view: TriageView,
    evidence: dict[str, bool] | None,
    knowledge: KnowledgeBase,
    policy: PrecheckPolicy = DEFAULT_POLICY,
    note: str | None = None,
) -> PrecheckResult:
    if evidence is None:
        checklist = [
            ChecklistState(item.key, item.label, item.required, False)
            for item in items_for(view.category)
        ]
        missing_keys = None
        missing_states: list[ChecklistState] = []
    else:
        checklist = evaluate(view.category, evidence)
        missing_states = missing_required(checklist)
        missing_keys = [state.key for state in missing_states]

    matches = knowledge.search(view, policy.similarity_floor)
    category_counts = knowledge.category_counts(view.category, view.created_at)
    signals = build_signals(matches, category_counts, policy)
    verdict, rule = decide(view.priority, missing_keys, signals, policy)

    reasons = [
        _RULE_REASONS[rule],
        f"Similar closed escalations ({signals.match_total}): "
        f"{_format_counts(signals.match_counts)}.",
        f"Category outcome history ({signals.category_total}): "
        f"{_format_counts(signals.category_counts)}.",
        THIN_EVIDENCE_NOTE,
    ]
    if missing_states:
        labels = "; ".join(state.label for state in missing_states)
        prefix = "Warning, missing evidence" if rule is Rule.P1_FAST_PATH else "Missing evidence"
        reasons.insert(1, f"{prefix}: {labels}.")
    suggested_action = _SUGGESTED_ACTIONS[rule]
    if rule in {Rule.MISSING_EVIDENCE, Rule.NO_HOLD_SIGNAL} and has_l1_hint(signals, policy):
        reasons.insert(1, L1_HINT)
        suggested_action += " Optional: try a quick config or how-to check at L1."
    if note:
        reasons.append("Agent note received; it is not used in scoring.")

    return PrecheckResult(
        ticket_id=view.ticket_id,
        verdict=verdict,
        rule=rule,
        confidence_band=confidence_band(signals),
        reasons=reasons,
        checklist=checklist,
        similar=matches[: policy.top_k],
        suggested_action=suggested_action,
    )
