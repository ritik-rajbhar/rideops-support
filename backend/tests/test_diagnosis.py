from datetime import datetime

from app.services.diagnosis import diagnosis
from app.services.ingest import load_tickets
from tests.conftest import CONFIG, FIXED, escalated, row, write_csv


def test_open_hours_and_agent_quality(tmp_path):
    rows = [
        escalated("T-1", "2026-07-20 00:00", "2026-07-21 00:00", FIXED, csat_score="4"),
        escalated("T-2", "2026-07-20 00:00", "2026-07-23 00:00", CONFIG, csat_score="2"),
        row(
            "T-3",
            "2026-07-20 00:00",
            first_closed_at="2026-07-20 06:00",
            final_closed_at="2026-07-21 00:00",
            reopen_count="1",
        ),
        row("T-4", "2026-07-21 00:00", status="Open - with L1"),
    ]
    tickets = load_tickets(write_csv(tmp_path / "d.csv", rows))
    body = diagnosis(tickets, snapshot=datetime(2026, 7, 22, 0, 0))
    headline = body["headline"]

    # Open hours: T-1 24h, T-2 48h (open at snapshot), T-3 24h, T-4 24h.
    assert headline["open_hours_share_escalated"] == 0.6
    assert headline["open_hours_share_avoidable"] == 0.4
    assert headline["bounced"] == 1
    assert headline["median_close_h_fixed"] == 24.0
    assert headline["median_close_h_bounced"] == 72.0
    assert headline["csat_bounced"] == 2.0

    agent = body["agents"][0]
    assert agent["escalation_rate"] == 0.5
    assert agent["median_first_close_h"] == 6.0
    assert agent["reopen_rate"] == 1.0

    outcomes = {item["outcome"]: item for item in body["outcomes"]}
    assert outcomes[CONFIG]["avoidable"] is True
    assert outcomes[FIXED]["avoidable"] is False
