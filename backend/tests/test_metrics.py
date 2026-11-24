from datetime import datetime

from app.services.ingest import load_tickets
from app.services.metrics import weekly_metrics
from tests.conftest import CONFIG, FIXED, escalated, row, write_csv


def test_open_count_and_avoidable_share(tmp_path):
    rows = [
        escalated("T-1", "2026-07-20 09:00", "2026-07-21 09:00", FIXED, priority="P1"),
        escalated("T-2", "2026-07-20 10:00", "2026-07-22 10:00", CONFIG),
        row("T-3", "2026-07-21 10:00", status="Open - with L1"),
    ]
    tickets = load_tickets(write_csv(tmp_path / "m.csv", rows))
    body = weekly_metrics(tickets, snapshot=datetime(2026, 8, 1, 23, 59))
    assert body["totals"]["open"] == 1
    assert body["totals"]["avoidable_share"] == 0.5
    week = next(w for w in body["weeks"] if w["week_start"] == "2026-07-19")
    assert week["arrivals"] == 3
    assert week["closures"] == 2
    assert week["net_flow"] == 1
    assert week["avoidable_escalation_share"] == 0.5
    assert week["p1p2_median_close_h"] == 24.0
