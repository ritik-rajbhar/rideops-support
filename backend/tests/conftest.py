import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.checklists import CHECKLISTS
from app.main import create_app
from app.services.ingest import REQUIRED_COLUMNS

ACCESS_CODE = "test-code"
HEADERS = {"X-Access-Code": ACCESS_CODE}
EXPORT = "Report export failing"
ROSTER = "Roster / booking not syncing"
DUPLICATE = "Duplicate of known issue"
FIXED = "Fixed"
CONFIG = "Config issue - returned to L1"


def row(ticket_id, created, category=ROSTER, priority="P3", text="alpha widget stopped", **extra):
    base = {
        "ticket_id": ticket_id,
        "created_at": created,
        "channel": "Email",
        "client_id": "CL-T1",
        "client_name": "Example Client",
        "client_tier": "SMB",
        "category": category,
        "priority": priority,
        "description": text,
        "assigned_agent": "Agent Test",
        "first_response_at": "",
        "escalated_to_eng": "No",
        "eng_ticket_id": "",
        "eng_handoffs": "0",
        "eng_outcome": "",
        "status": "Closed",
        "first_closed_at": "",
        "final_closed_at": "",
        "reopen_count": "0",
        "csat_score": "",
    }
    base.update(extra)
    return base


def escalated(ticket_id, created, closed, outcome, **kwargs):
    return row(
        ticket_id,
        created,
        escalated_to_eng="Yes",
        eng_ticket_id=f"ENG-{ticket_id}",
        eng_handoffs="1",
        eng_outcome=outcome,
        first_closed_at=closed,
        final_closed_at=closed,
        **kwargs,
    )


def fixture_rows():
    rows = []
    for index in range(10):
        rows.append(
            escalated(
                f"T-E{index}",
                f"2026-07-{index + 10} 10:00",
                f"2026-07-{index + 10} 18:00",
                DUPLICATE,
                category=EXPORT,
                text="sample export button times out",
            )
        )
    for index in range(4):
        rows.append(
            escalated(
                f"T-F{index}",
                f"2026-08-1{index} 09:00",
                f"2026-08-1{index} 20:00",
                FIXED,
                text="alpha widget stopped",
                csat_score="4",
            )
        )
    rows += [
        row(
            "T-Q1",
            "2026-09-10 09:00",
            category=EXPORT,
            text="sample export button times out",
            first_closed_at="2026-09-10 12:00",
            final_closed_at="2026-09-10 12:00",
        ),
        row(
            "T-P1",
            "2026-09-11 09:00",
            category=EXPORT,
            priority="P1",
            text="sample export button times out",
            first_closed_at="2026-09-11 12:00",
            final_closed_at="2026-09-11 12:00",
        ),
        row(
            "T-R1",
            "2026-09-12 09:00",
            text="alpha widget stopped",
            first_closed_at="2026-09-12 12:00",
            final_closed_at="2026-09-12 12:00",
        ),
        escalated(
            "T-OPEN",
            "2026-09-20 09:00",
            "",
            CONFIG,
            status="Open - with Engineering",
            text="alpha widget stopped",
        ),
        row("T-L1", "2026-09-21 09:00", status="Open - with L1", text="beta panel blank"),
        escalated(
            "T-FUT",
            "2026-09-13 09:00",
            "2026-09-25 09:00",
            DUPLICATE,
            text="future only marker phrase",
        ),
    ]
    return rows


def write_csv(path: Path, rows) -> Path:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


@pytest.fixture
def data_path(tmp_path) -> Path:
    return write_csv(tmp_path / "tickets.csv", fixture_rows())


def make_client(data_path, access_code=ACCESS_CODE):
    settings = Settings(
        ACCESS_CODE=access_code,
        RIDEOPS_DATA_PATH=str(data_path) if data_path else None,
        DATABASE_URL="sqlite://",
        _env_file=None,
    )
    return TestClient(create_app(settings))


@pytest.fixture
def client(data_path):
    with make_client(data_path) as test_client:
        yield test_client


def all_evidence(category):
    return {item.key: True for item in CHECKLISTS[category]}
