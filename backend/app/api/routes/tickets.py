from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import AppState, get_state
from app.auth import require_access_code
from app.domain.models import (
    PRIORITY_P1,
    TicketRecord,
    TriageView,
    Verdict,
    override_reason_required,
)
from app.domain.schemas import (
    ChecklistEntry,
    DecisionRequest,
    DecisionResponse,
    PrecheckRequest,
    PrecheckResponse,
    SimilarTicket,
    Ticket,
    TicketList,
    TicketSummary,
)
from app.services.checklist import UnknownEvidenceKeyError
from app.services.precheck import run_precheck

router = APIRouter(prefix="/tickets", tags=["tickets"], dependencies=[Depends(require_access_code)])

POST_TRIAGE_FIELDS = (
    "eng_handoffs",
    "eng_outcome",
    "first_closed_at",
    "final_closed_at",
    "reopen_count",
    "csat_score",
)


def _find(state: AppState, ticket_id: str) -> TicketRecord:
    ticket = state.data.tickets.get(ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


def _summary(ticket: TicketRecord) -> TicketSummary:
    fields = {name: getattr(ticket, name) for name in TicketSummary.model_fields}
    return TicketSummary(**fields)


@router.get("", response_model=TicketList)
def list_tickets(
    ticket_status: Literal["open", "all"] = Query(default="all", alias="status"),
    agent: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    state: AppState = Depends(get_state),
) -> TicketList:
    items, total = state.data.tickets.search(
        status=ticket_status,
        agent=agent,
        category=category,
        priority=priority,
        q=q,
        limit=limit,
        offset=offset,
    )
    return TicketList(items=[_summary(ticket) for ticket in items], total=total)


@router.get("/{ticket_id}", response_model=Ticket)
def get_ticket(ticket_id: str, state: AppState = Depends(get_state)) -> Ticket:
    ticket = _find(state, ticket_id)
    fields = asdict(ticket)
    if ticket.is_open:
        for name in POST_TRIAGE_FIELDS:
            fields[name] = None
    return Ticket(**fields)


@router.post("/{ticket_id}/precheck", response_model=PrecheckResponse)
def precheck(
    ticket_id: str,
    body: PrecheckRequest,
    state: AppState = Depends(get_state),
) -> PrecheckResponse:
    ticket = _find(state, ticket_id)
    try:
        result = run_precheck(
            TriageView.from_ticket(ticket),
            body.evidence,
            state.data.knowledge,
            note=body.note,
        )
    except UnknownEvidenceKeyError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return PrecheckResponse(
        ticket_id=result.ticket_id,
        verdict=result.verdict,
        confidence_band=result.confidence_band,
        reasons=result.reasons,
        checklist=[
            ChecklistEntry(key=s.key, label=s.label, required=s.required, done=s.done)
            for s in result.checklist
        ],
        similar=[
            SimilarTicket(
                ticket_id=m.entry.ticket_id,
                description=m.entry.description,
                category=m.entry.category,
                eng_outcome=m.entry.eng_outcome,
                similarity=m.similarity,
                closed_at=m.entry.closed_at,
            )
            for m in result.similar
        ],
        suggested_action=result.suggested_action,
    )


@router.post(
    "/{ticket_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_decision(
    ticket_id: str,
    body: DecisionRequest,
    state: AppState = Depends(get_state),
) -> DecisionResponse:
    ticket = _find(state, ticket_id)
    if ticket.priority == PRIORITY_P1:
        server_verdict = Verdict.READY_TO_ESCALATE
    else:
        try:
            server_verdict = run_precheck(
                TriageView.from_ticket(ticket), body.evidence or {}, state.data.knowledge
            ).verdict
        except UnknownEvidenceKeyError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    reason = body.override_reason or None
    if override_reason_required(body.action, server_verdict, ticket.priority) and not reason:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "override_reason is required when escalating against this verdict",
        )
    row = state.decisions.add(
        ticket_id=ticket.ticket_id,
        action=body.action.value,
        verdict_shown=body.verdict_shown.value if body.verdict_shown else None,
        server_verdict=server_verdict.value,
        override_reason=reason,
        agent=body.agent,
    )
    return DecisionResponse.model_validate(row)
