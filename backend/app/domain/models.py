from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class Verdict(StrEnum):
    LIKELY_KNOWN_ISSUE = "likely_known_issue"
    TRY_L1_FIX = "try_l1_fix"
    NEEDS_INFO = "needs_info"
    READY_TO_ESCALATE = "ready_to_escalate"


class ConfidenceBand(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DecisionAction(StrEnum):
    ESCALATED = "escalated"
    RESOLVED_AT_L1 = "resolved_at_l1"
    REQUESTED_INFO = "requested_info"


OUTCOME_FIXED = "Fixed"
OUTCOME_INSUFFICIENT = "Insufficient info - returned to L1"
OUTCOME_CONFIG = "Config issue - returned to L1"
OUTCOME_DUPLICATE = "Duplicate of known issue"
OUTCOME_HOW_TO = "Not a bug - how-to"
OUTCOME_NOT_REPRODUCIBLE = "Not reproducible"

ALL_OUTCOMES = frozenset(
    {
        OUTCOME_FIXED,
        OUTCOME_INSUFFICIENT,
        OUTCOME_CONFIG,
        OUTCOME_DUPLICATE,
        OUTCOME_HOW_TO,
        OUTCOME_NOT_REPRODUCIBLE,
    }
)
AVOIDABLE_OUTCOMES = frozenset(
    {OUTCOME_INSUFFICIENT, OUTCOME_CONFIG, OUTCOME_DUPLICATE, OUTCOME_HOW_TO}
)
L1_FIXABLE_OUTCOMES = frozenset({OUTCOME_CONFIG, OUTCOME_HOW_TO})

PRIORITY_P1 = "P1"
OVERRIDE_VERDICTS = frozenset({Verdict.LIKELY_KNOWN_ISSUE, Verdict.NEEDS_INFO})


@dataclass(frozen=True, slots=True)
class TicketRecord:
    ticket_id: str
    created_at: datetime
    channel: str
    client_id: str
    client_name: str
    client_tier: str
    category: str
    priority: str
    description: str
    assigned_agent: str
    first_response_at: datetime | None
    escalated_to_eng: bool
    eng_ticket_id: str | None
    eng_handoffs: int
    eng_outcome: str | None
    status: str
    first_closed_at: datetime | None
    final_closed_at: datetime | None
    reopen_count: int
    csat_score: float | None

    @property
    def is_open(self) -> bool:
        return self.final_closed_at is None


@dataclass(frozen=True, slots=True)
class TriageView:
    """The only ticket fields a precheck may read: all are known at triage."""

    ticket_id: str
    created_at: datetime
    category: str
    priority: str
    description: str

    @classmethod
    def from_ticket(cls, ticket: TicketRecord) -> "TriageView":
        return cls(
            ticket_id=ticket.ticket_id,
            created_at=ticket.created_at,
            category=ticket.category,
            priority=ticket.priority,
            description=ticket.description,
        )


def override_reason_required(action: DecisionAction, verdict: Verdict, priority: str) -> bool:
    return (
        action is DecisionAction.ESCALATED
        and verdict in OVERRIDE_VERDICTS
        and priority != PRIORITY_P1
    )
