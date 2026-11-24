"""Diagnosis of the backlog: where open-ticket time goes and who drives it.

Every number on the Diagnosis page comes from here, computed from the ticket file.
"""

from collections import defaultdict
from collections.abc import Callable, Sequence
from datetime import datetime
from statistics import mean, median

from app.config import SNAPSHOT_AT
from app.domain.models import AVOIDABLE_OUTCOMES, OUTCOME_FIXED, TicketRecord

BOUNCED_OUTCOMES = frozenset(
    {"Insufficient info - returned to L1", "Config issue - returned to L1"}
)


def _ratio(numerator: float, denominator: float) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def _median(values: list[float]) -> float | None:
    return _round(median(values)) if values else None


def _mean(values: list[float], digits: int = 2) -> float | None:
    return _round(mean(values), digits) if values else None


def _hours(start: datetime, end: datetime | None) -> float | None:
    return None if end is None else (end - start).total_seconds() / 3600


def _open_hours(ticket: TicketRecord, snapshot: datetime) -> float:
    end = min(ticket.final_closed_at or snapshot, snapshot)
    return max(0.0, (end - ticket.created_at).total_seconds() / 3600)


def _group(
    tickets: Sequence[TicketRecord], key: Callable[[TicketRecord], str]
) -> dict[str, list[TicketRecord]]:
    groups: dict[str, list[TicketRecord]] = defaultdict(list)
    for ticket in tickets:
        groups[key(ticket)].append(ticket)
    return groups


def _months(tickets: Sequence[TicketRecord]) -> list[dict[str, object]]:
    rows = []
    for month, group in sorted(_group(tickets, lambda t: t.created_at.strftime("%Y-%m")).items()):
        escalated = [t for t in group if t.escalated_to_eng]
        rows.append(
            {
                "month": month,
                "tickets": len(group),
                "escalation_rate": _ratio(len(escalated), len(group)),
                "avoidable_share": _ratio(
                    sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated), len(escalated)
                ),
                "median_close_h": _median(
                    [h for t in group if (h := _hours(t.created_at, t.final_closed_at)) is not None]
                ),
            }
        )
    return rows


def _outcomes(tickets: Sequence[TicketRecord]) -> list[dict[str, object]]:
    escalated = [t for t in tickets if t.escalated_to_eng and t.eng_outcome]
    rows = []
    for outcome, group in _group(escalated, lambda t: t.eng_outcome or "").items():
        rows.append(
            {
                "outcome": outcome,
                "avoidable": outcome in AVOIDABLE_OUTCOMES,
                "tickets": len(group),
                "median_close_h": _median(
                    [h for t in group if (h := _hours(t.created_at, t.final_closed_at)) is not None]
                ),
                "avg_handoffs": _mean([t.eng_handoffs for t in group]),
                "csat_avg": _mean([t.csat_score for t in group if t.csat_score is not None]),
            }
        )
    return sorted(rows, key=lambda row: -row["tickets"])


def _categories(tickets: Sequence[TicketRecord]) -> list[dict[str, object]]:
    rows = []
    for category, group in _group(tickets, lambda t: t.category).items():
        escalated = [t for t in group if t.escalated_to_eng]
        avoidable = sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated)
        rows.append(
            {
                "category": category,
                "tickets": len(group),
                "escalated": len(escalated),
                "escalation_rate": _ratio(len(escalated), len(group)),
                "avoidable": avoidable,
                "avoidable_share": _ratio(avoidable, len(escalated)),
            }
        )
    return sorted(rows, key=lambda row: (-row["avoidable"], row["category"]))


def _agents(tickets: Sequence[TicketRecord]) -> list[dict[str, object]]:
    rows = []
    for agent, group in _group(tickets, lambda t: t.assigned_agent).items():
        escalated = [t for t in group if t.escalated_to_eng]
        kept = [t for t in group if not t.escalated_to_eng and t.first_closed_at]
        rows.append(
            {
                "agent": agent,
                "tickets": len(group),
                "escalation_rate": _ratio(len(escalated), len(group)),
                "avoidable": sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated),
                "avoidable_share": _ratio(
                    sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated), len(escalated)
                ),
                "median_first_close_h": _median(
                    [h for t in kept if (h := _hours(t.created_at, t.first_closed_at)) is not None]
                ),
                "reopen_rate": _ratio(sum(t.reopen_count > 0 for t in kept), len(kept)),
                "csat_avg": _mean([t.csat_score for t in group if t.csat_score is not None]),
            }
        )
    return sorted(rows, key=lambda row: -row["avoidable"])


def diagnosis(
    tickets: Sequence[TicketRecord], snapshot: datetime = SNAPSHOT_AT
) -> dict[str, object]:
    escalated = [t for t in tickets if t.escalated_to_eng]
    avoidable = [t for t in escalated if t.eng_outcome in AVOIDABLE_OUTCOMES]
    bounced = [t for t in escalated if t.eng_outcome in BOUNCED_OUTCOMES]
    fixed = [t for t in escalated if t.eng_outcome == OUTCOME_FIXED]
    total_open_h = sum(_open_hours(t, snapshot) for t in tickets)

    def close_hours(group: Sequence[TicketRecord]) -> float | None:
        return _median(
            [h for t in group if (h := _hours(t.created_at, t.final_closed_at)) is not None]
        )

    def csat(group: Sequence[TicketRecord]) -> float | None:
        return _mean([t.csat_score for t in group if t.csat_score is not None])

    months = _months(tickets)
    return {
        "snapshot": snapshot.isoformat(sep=" "),
        "headline": {
            "tickets": len(tickets),
            "escalated": len(escalated),
            "escalation_rate": _ratio(len(escalated), len(tickets)),
            "avoidable": len(avoidable),
            "avoidable_share": _ratio(len(avoidable), len(escalated)),
            "bounced": len(bounced),
            "bounced_share": _ratio(len(bounced), len(escalated)),
            "intake_first_month": months[0]["tickets"] if months else None,
            "intake_last_month": months[-1]["tickets"] if months else None,
            "median_close_h_escalated": close_hours(escalated),
            "median_close_h_not_escalated": close_hours(
                [t for t in tickets if not t.escalated_to_eng]
            ),
            "median_close_h_fixed": close_hours(fixed),
            "median_close_h_bounced": close_hours(bounced),
            "open_hours_share_escalated": _ratio(
                sum(_open_hours(t, snapshot) for t in escalated), total_open_h
            ),
            "open_hours_share_avoidable": _ratio(
                sum(_open_hours(t, snapshot) for t in avoidable), total_open_h
            ),
            "csat_escalated": csat(escalated),
            "csat_not_escalated": csat([t for t in tickets if not t.escalated_to_eng]),
            "csat_bounced": csat(bounced),
        },
        "months": months,
        "outcomes": _outcomes(tickets),
        "categories": _categories(tickets),
        "agents": _agents(tickets),
    }
