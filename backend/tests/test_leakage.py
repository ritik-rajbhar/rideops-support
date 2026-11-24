from dataclasses import replace
from datetime import datetime

from app.domain.models import OUTCOME_FIXED, TriageView
from app.services.ingest import load_tickets
from app.services.precheck import run_precheck
from app.services.retrieval import KnowledgeBase
from tests.conftest import (
    DUPLICATE,
    EXPORT,
    FIXED,
    all_evidence,
    escalated,
    fixture_rows,
    row,
    write_csv,
)


def result_key(result):
    return (
        result.verdict,
        result.rule,
        result.confidence_band,
        tuple(result.reasons),
        tuple((m.entry.ticket_id, m.similarity) for m in result.similar),
    )


def test_retrieval_uses_only_tickets_closed_before_query(data_path):
    tickets = load_tickets(data_path)
    knowledge = KnowledgeBase(tickets)
    for ticket in tickets:
        view = TriageView.from_ticket(ticket)
        for match in knowledge.search(view, floor=0.0):
            assert match.entry.closed_at < ticket.created_at
            assert match.entry.ticket_id != ticket.ticket_id


def test_ticket_closing_exactly_at_query_time_is_excluded(tmp_path):
    rows = [
        escalated("T-A", "2026-08-01 09:00", "2026-08-05 10:00", FIXED, text="same words here"),
        escalated("T-B", "2026-08-01 09:00", "2026-08-05 09:59", FIXED, text="same words here"),
        row("T-Q", "2026-08-05 10:00", text="same words here"),
    ]
    tickets = load_tickets(write_csv(tmp_path / "edge.csv", rows))
    query = TriageView.from_ticket(next(t for t in tickets if t.ticket_id == "T-Q"))
    found = {m.entry.ticket_id for m in KnowledgeBase(tickets).search(query, 0.0)}
    assert found == {"T-B"}


def test_query_ticket_post_triage_fields_cannot_change_result(data_path):
    tickets = load_tickets(data_path)
    target = next(t for t in tickets if t.ticket_id == "T-FUT")
    mutated = replace(
        target,
        eng_outcome=OUTCOME_FIXED,
        eng_handoffs=9,
        first_closed_at=datetime(2026, 9, 29, 9),
        final_closed_at=datetime(2026, 9, 29, 9),
        reopen_count=5,
        csat_score=1.0,
    )
    others = [t for t in tickets if t.ticket_id != target.ticket_id]
    evidence = all_evidence(target.category)
    original = run_precheck(TriageView.from_ticket(target), evidence, KnowledgeBase(tickets))
    changed = run_precheck(
        TriageView.from_ticket(mutated), evidence, KnowledgeBase([*others, mutated])
    )
    assert result_key(original) == result_key(changed)


def test_future_outcomes_do_not_change_past_result(tmp_path):
    base = fixture_rows()
    future = [
        escalated(
            f"T-X{i}",
            "2026-09-26 09:00",
            "2026-09-27 09:00",
            DUPLICATE,
            category=EXPORT,
            text="sample export button times out",
        )
        for i in range(10)
    ]
    before = load_tickets(write_csv(tmp_path / "a.csv", base))
    after = load_tickets(write_csv(tmp_path / "b.csv", base + future))
    view = TriageView.from_ticket(next(t for t in before if t.ticket_id == "T-Q1"))
    evidence = all_evidence(EXPORT)
    assert result_key(run_precheck(view, evidence, KnowledgeBase(before))) == result_key(
        run_precheck(view, evidence, KnowledgeBase(after))
    )


def test_open_ticket_hides_post_triage_fields(client):
    from tests.conftest import HEADERS

    body = client.get("/api/v1/tickets/T-OPEN", headers=HEADERS).json()
    for field in (
        "eng_outcome",
        "eng_handoffs",
        "first_closed_at",
        "final_closed_at",
        "reopen_count",
        "csat_score",
    ):
        assert body[field] is None
    closed = client.get("/api/v1/tickets/T-E0", headers=HEADERS).json()
    assert closed["eng_outcome"] == DUPLICATE


def test_every_open_ticket_hides_populated_post_triage_fields(tmp_path):
    from tests.conftest import HEADERS, make_client

    rows = [
        escalated(
            "T-REOPENED",
            "2026-09-01 09:00",
            "",
            FIXED,
            status="Open - with L1",
        )
    ]
    rows[0].update(
        first_closed_at="2026-09-02 09:00", eng_handoffs="3", reopen_count="2", csat_score="1"
    )
    rows.append(row("T-CLOSED", "2026-09-01 10:00", final_closed_at="2026-09-02 10:00"))
    fields = (
        "eng_outcome",
        "eng_handoffs",
        "first_closed_at",
        "final_closed_at",
        "reopen_count",
        "csat_score",
    )
    with make_client(write_csv(tmp_path / "open.csv", rows)) as client:
        listed = client.get("/api/v1/tickets?status=open", headers=HEADERS).json()
        assert [item["ticket_id"] for item in listed["items"]] == ["T-REOPENED"]
        for item in listed["items"]:
            body = client.get(f"/api/v1/tickets/{item['ticket_id']}", headers=HEADERS).json()
            assert {field: body[field] for field in fields} == dict.fromkeys(fields)
