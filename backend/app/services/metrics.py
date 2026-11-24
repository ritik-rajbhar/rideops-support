"""Weekly operations metrics. Weeks run Sunday to Saturday so 19 Jul starts a week."""

from collections.abc import Sequence
from datetime import datetime, time, timedelta
from statistics import mean, median

import numpy as np

from app.config import BASELINE_START, SNAPSHOT_AT
from app.domain.models import AVOIDABLE_OUTCOMES, TicketRecord

HIGH_PRIORITIES = {"P1", "P2"}
BASELINE_FIELDS = (
    "arrivals",
    "closures",
    "net_flow",
    "avg_open_7d",
    "avoidable_escalation_share",
    "reopen_rate",
    "p1p2_median_close_h",
    "csat_avg",
    "csat_response_rate",
)


def _week_start(moment: datetime) -> datetime:
    day = datetime.combine(moment.date(), time.min)
    return day - timedelta(days=(day.weekday() + 1) % 7)


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _rounded(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def _open_counts(tickets: Sequence[TicketRecord], moments: list[datetime]) -> list[int]:
    created = np.sort(np.array([t.created_at for t in tickets], dtype="datetime64[m]"))
    closed = np.sort(
        np.array([t.final_closed_at for t in tickets if t.final_closed_at], dtype="datetime64[m]")
    )
    points = np.array(moments, dtype="datetime64[m]")
    opened = np.searchsorted(created, points, side="right")
    finished = np.searchsorted(closed, points, side="right")
    return (opened - finished).tolist()


def weekly_metrics(
    tickets: Sequence[TicketRecord], snapshot: datetime = SNAPSHOT_AT
) -> dict[str, object]:
    if not tickets:
        return {"weeks": [], "baseline": None, "totals": _totals(tickets)}

    first_seen = min(ticket.created_at for ticket in tickets)
    first_day = datetime.combine(first_seen.date(), time.min)
    weeks: list[dict[str, object]] = []
    start = _week_start(first_seen)
    while start <= snapshot:
        end = start + timedelta(days=7)
        created = [t for t in tickets if start <= t.created_at < end]
        closed = [t for t in tickets if t.final_closed_at and start <= t.final_closed_at < end]
        escalated = [t for t in created if t.escalated_to_eng]
        partial = start < first_day or end - timedelta(minutes=1) > snapshot

        moments = []
        for offset in range(7):
            day = start + timedelta(days=offset)
            if first_day <= day <= snapshot:
                moments.append(min(day + timedelta(hours=23, minutes=59), snapshot))
        open_counts = _open_counts(tickets, moments)

        high_priority_hours = [
            (t.final_closed_at - t.created_at).total_seconds() / 3600
            for t in closed
            if t.priority in HIGH_PRIORITIES
        ]
        scores = [t.csat_score for t in closed if t.csat_score is not None]
        avoidable = sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated)
        weeks.append(
            {
                "week_start": start.date().isoformat(),
                "partial": partial,
                "in_baseline": not partial and start >= BASELINE_START,
                "arrivals": len(created),
                "closures": len(closed),
                "net_flow": len(created) - len(closed),
                "avg_open_7d": _rounded(mean(open_counts)) if open_counts else None,
                "avoidable_escalation_share": _ratio(avoidable, len(escalated)),
                "reopen_rate": _ratio(sum(t.reopen_count > 0 for t in closed), len(closed)),
                "p1p2_median_close_h": _rounded(
                    median(high_priority_hours) if high_priority_hours else None
                ),
                "csat_avg": _rounded(mean(scores) if scores else None),
                "csat_response_rate": _ratio(len(scores), len(closed)),
            }
        )
        start = end

    return {"weeks": weeks, "baseline": _baseline(weeks), "totals": _totals(tickets)}


def _baseline(weeks: list[dict[str, object]]) -> dict[str, object] | None:
    included = [week for week in weeks if week["in_baseline"]]
    if not included:
        return None
    averages: dict[str, float | None] = {}
    for field in BASELINE_FIELDS:
        values = [week[field] for week in included if week[field] is not None]
        averages[field] = round(mean(values), 4) if values else None
    return {
        "from_week": included[0]["week_start"],
        "to_week": included[-1]["week_start"],
        "weeks": len(included),
        "weekly_mean": averages,
    }


def _totals(tickets: Sequence[TicketRecord]) -> dict[str, object]:
    escalated = [t for t in tickets if t.escalated_to_eng]
    avoidable = sum(t.eng_outcome in AVOIDABLE_OUTCOMES for t in escalated)
    return {
        "tickets": len(tickets),
        "open": sum(t.is_open for t in tickets),
        "escalated": len(escalated),
        "avoidable": avoidable,
        "avoidable_share": _ratio(avoidable, len(escalated)),
    }
