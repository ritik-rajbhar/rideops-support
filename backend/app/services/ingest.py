from datetime import datetime
from pathlib import Path

import pandas as pd

from app.domain.checklists import CHECKLISTS
from app.domain.models import ALL_OUTCOMES, TicketRecord

REQUIRED_COLUMNS = (
    "ticket_id",
    "created_at",
    "channel",
    "client_id",
    "client_name",
    "client_tier",
    "category",
    "priority",
    "description",
    "assigned_agent",
    "first_response_at",
    "escalated_to_eng",
    "eng_ticket_id",
    "eng_handoffs",
    "eng_outcome",
    "status",
    "first_closed_at",
    "final_closed_at",
    "reopen_count",
    "csat_score",
)
TIMESTAMP_COLUMNS = ("created_at", "first_response_at", "first_closed_at", "final_closed_at")
TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M"


class DataLoadError(RuntimeError):
    """The ticket data is missing or does not match the expected shape."""


def _timestamp(value: str | None) -> datetime | None:
    return None if value is None else datetime.strptime(value, TIMESTAMP_FORMAT)


def _text(value: object) -> str | None:
    return None if pd.isna(value) else str(value)


def _validate(frame: pd.DataFrame) -> None:
    missing = sorted(set(REQUIRED_COLUMNS) - set(frame.columns))
    if missing:
        raise DataLoadError(f"Missing columns: {', '.join(missing)}")
    if frame["ticket_id"].isna().any() or frame["ticket_id"].duplicated().any():
        raise DataLoadError("ticket_id must be present and unique")
    unknown = set(frame["category"].dropna()) - set(CHECKLISTS)
    if unknown or frame["category"].isna().any():
        raise DataLoadError(f"{len(unknown)} category value(s) have no checklist")
    if set(frame["eng_outcome"].dropna()) - ALL_OUTCOMES:
        raise DataLoadError("Unknown eng_outcome value")
    if set(frame["escalated_to_eng"].dropna()) - {"Yes", "No"}:
        raise DataLoadError("escalated_to_eng must be Yes or No")


def load_tickets(path: str | Path | None) -> list[TicketRecord]:
    if not path:
        raise DataLoadError("RIDEOPS_DATA_PATH is not set")
    try:
        frame = pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""])
    except (OSError, ValueError) as exc:
        raise DataLoadError("Ticket data could not be read") from exc
    _validate(frame)

    try:
        tickets = [
            TicketRecord(
                ticket_id=row["ticket_id"],
                created_at=_timestamp(_text(row["created_at"])),
                channel=row["channel"],
                client_id=row["client_id"],
                client_name=row["client_name"],
                client_tier=row["client_tier"],
                category=row["category"],
                priority=row["priority"],
                description=row["description"],
                assigned_agent=row["assigned_agent"],
                first_response_at=_timestamp(_text(row["first_response_at"])),
                escalated_to_eng=row["escalated_to_eng"] == "Yes",
                eng_ticket_id=_text(row["eng_ticket_id"]),
                eng_handoffs=int(row["eng_handoffs"]),
                eng_outcome=_text(row["eng_outcome"]),
                status=row["status"],
                first_closed_at=_timestamp(_text(row["first_closed_at"])),
                final_closed_at=_timestamp(_text(row["final_closed_at"])),
                reopen_count=int(row["reopen_count"]),
                csat_score=None if pd.isna(row["csat_score"]) else float(row["csat_score"]),
            )
            for row in frame.to_dict("records")
        ]
    except (TypeError, ValueError) as exc:
        raise DataLoadError("Ticket data has an invalid value") from exc
    if any(ticket.created_at is None for ticket in tickets):
        raise DataLoadError("created_at is required")
    return tickets
