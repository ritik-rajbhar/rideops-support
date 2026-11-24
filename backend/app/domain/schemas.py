from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.domain.models import ConfidenceBand, DecisionAction, Verdict

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class TicketSummary(BaseModel):
    ticket_id: str
    created_at: datetime
    channel: str
    client_name: str
    client_tier: str
    category: str
    priority: str
    description: str
    assigned_agent: str
    status: str
    escalated_to_eng: bool


class TicketList(BaseModel):
    items: list[TicketSummary]
    total: int


class Ticket(TicketSummary):
    client_id: str
    first_response_at: datetime | None = None
    eng_ticket_id: str | None = None
    eng_handoffs: int | None = None
    eng_outcome: str | None = None
    first_closed_at: datetime | None = None
    final_closed_at: datetime | None = None
    reopen_count: int | None = None
    csat_score: float | None = None


class PrecheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence: dict[str, bool]
    note: LongText | None = None


class ChecklistEntry(BaseModel):
    key: str
    label: str
    required: bool
    done: bool


class SimilarTicket(BaseModel):
    ticket_id: str
    description: str
    category: str
    eng_outcome: str
    similarity: float
    closed_at: datetime


class PrecheckResponse(BaseModel):
    ticket_id: str
    verdict: Verdict
    confidence_band: ConfidenceBand
    reasons: list[str]
    checklist: list[ChecklistEntry]
    similar: list[SimilarTicket]
    suggested_action: str
    override_allowed: Literal[True] = True


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: DecisionAction
    verdict_shown: Verdict | None = None
    evidence: dict[str, bool] | None = None
    override_reason: LongText | None = None
    agent: ShortText


class DecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: str
    action: DecisionAction
    verdict_shown: Verdict | None
    server_verdict: Verdict
    override_reason: str | None
    agent: str
    created_at: datetime


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
