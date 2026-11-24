import pytest

from app.domain.checklists import CHECKLISTS
from tests.conftest import (
    CONFIG,
    EXPORT,
    HEADERS,
    ROSTER,
    all_evidence,
    escalated,
    make_client,
    row,
    write_csv,
)

PROTECTED = [
    ("get", "/api/v1/tickets"),
    ("get", "/api/v1/tickets/T-Q1"),
    ("post", "/api/v1/tickets/T-Q1/precheck"),
    ("post", "/api/v1/tickets/T-Q1/decisions"),
    ("get", "/api/v1/metrics/weekly"),
    ("get", "/api/v1/metrics/backtest"),
    ("get", "/api/v1/metrics/diagnosis"),
]


def precheck(client, ticket_id, evidence):
    response = client.post(
        f"/api/v1/tickets/{ticket_id}/precheck", headers=HEADERS, json={"evidence": evidence}
    )
    assert response.status_code == 200, response.text
    return response.json()


def decide(client, ticket_id, **body):
    payload = {"agent": "Agent Test", **body}
    return client.post(f"/api/v1/tickets/{ticket_id}/decisions", headers=HEADERS, json=payload)


def test_health_needs_no_auth_or_data():
    with make_client(None, access_code=None) as client:
        assert client.get("/api/v1/health").json() == {"status": "ok"}


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_missing_or_wrong_code_rejected(client, method, path):
    assert client.request(method, path).status_code == 401
    wrong = client.request(method, path, headers={"X-Access-Code": "nope"})
    assert wrong.status_code == 401


@pytest.mark.parametrize("configured", [None, ""])
@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_fails_closed_when_code_unset(data_path, configured, method, path):
    with make_client(data_path, access_code=configured) as client:
        response = client.request(method, path, headers={"X-Access-Code": ""})
        assert response.status_code == 503


def test_non_ascii_code_is_rejected_cleanly(client):
    response = client.get("/api/v1/tickets", headers={"X-Access-Code": "caf\xe9".encode("latin-1")})
    assert response.status_code == 401


def test_ticket_filters_and_pagination(client):
    body = client.get("/api/v1/tickets?status=open", headers=HEADERS).json()
    assert body["total"] == 2
    assert {item["ticket_id"] for item in body["items"]} == {"T-OPEN", "T-L1"}
    assert "eng_outcome" not in body["items"][0]
    page = client.get("/api/v1/tickets?limit=3&offset=1", headers=HEADERS).json()
    assert len(page["items"]) == 3
    assert page["total"] == 20
    found = client.get("/api/v1/tickets?q=BETA%20PANEL", headers=HEADERS).json()
    assert [item["ticket_id"] for item in found["items"]] == ["T-L1"]
    assert client.get("/api/v1/tickets?status=bad", headers=HEADERS).status_code == 422


def test_unknown_ticket_is_404(client):
    assert client.get("/api/v1/tickets/NOPE", headers=HEADERS).status_code == 404


def test_every_category_has_required_evidence():
    assert len(CHECKLISTS) == 10
    for items in CHECKLISTS.values():
        assert any(item.required for item in items)
        assert len({item.key for item in items}) == len(items)


def test_known_issue_verdict_explains_itself(client):
    body = precheck(client, "T-Q1", {})
    assert body["verdict"] == "likely_known_issue"
    assert body["override_allowed"] is True
    assert body["similar"][0]["eng_outcome"] == "Duplicate of known issue"
    assert body["similar"][0]["similarity"] > 0.9
    joined = " ".join(body["reasons"])
    assert "KNOWN_ISSUE_HISTORY" in joined
    assert "category outcome history" in joined.lower()


def test_missing_evidence_then_ready(client):
    assert precheck(client, "T-R1", {})["verdict"] == "needs_info"
    done = precheck(client, "T-R1", all_evidence(ROSTER))
    assert done["verdict"] == "ready_to_escalate"
    assert all(item["done"] for item in done["checklist"])


def test_unknown_evidence_key_rejected(client):
    response = client.post(
        "/api/v1/tickets/T-R1/precheck", headers=HEADERS, json={"evidence": {"bogus": True}}
    )
    assert response.status_code == 422


@pytest.mark.parametrize("evidence", [{}, all_evidence(EXPORT)])
def test_p1_is_never_held(client, evidence):
    body = precheck(client, "T-P1", evidence)
    assert body["verdict"] == "ready_to_escalate"
    assert "P1_FAST_PATH" in body["reasons"][0]
    assert body["suggested_action"].startswith("Escalate now")
    if not evidence:
        assert any(reason.startswith("Warning") for reason in body["reasons"])


def test_override_reason_required_against_non_ready_verdict(client):
    rejected = decide(client, "T-Q1", action="escalated", verdict_shown="likely_known_issue")
    assert rejected.status_code == 422
    blank = decide(
        client,
        "T-Q1",
        action="escalated",
        verdict_shown="needs_info",
        override_reason="   ",
    )
    assert blank.status_code == 422
    accepted = decide(
        client,
        "T-Q1",
        action="escalated",
        verdict_shown="likely_known_issue",
        override_reason="Different error from the known issue",
    )
    assert accepted.status_code == 201
    assert accepted.json()["override_reason"] == "Different error from the known issue"


def test_override_not_required_for_p1_or_ready_or_non_escalation(client):
    assert decide(client, "T-P1", action="escalated", verdict_shown="needs_info").status_code == 201
    ready = decide(
        client,
        "T-R1",
        action="escalated",
        verdict_shown="ready_to_escalate",
        evidence=all_evidence(ROSTER),
    )
    assert ready.status_code == 201
    assert ready.json()["server_verdict"] == "ready_to_escalate"
    assert (
        decide(client, "T-Q1", action="resolved_at_l1", verdict_shown="try_l1_fix").status_code
        == 201
    )


@pytest.mark.parametrize(("ticket_id", "server"), [("T-Q1", "known"), ("T-R1", "info")])
def test_misreported_verdict_cannot_avoid_override_reason(client, ticket_id, server):
    response = decide(client, ticket_id, action="escalated", verdict_shown="ready_to_escalate")
    assert response.status_code == 422, server


def test_decision_stores_client_and_server_verdicts(client):
    response = decide(
        client,
        "T-Q1",
        action="escalated",
        verdict_shown="ready_to_escalate",
        override_reason="Agent saw a different error",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["verdict_shown"] == "ready_to_escalate"
    assert body["server_verdict"] == "likely_known_issue"


@pytest.mark.parametrize("extra", [{}, {"evidence": None}, {"evidence": {"stale_key": True}}])
def test_null_verdict_on_p1_succeeds_without_reason(client, extra):
    response = decide(client, "T-P1", action="escalated", verdict_shown=None, **extra)
    assert response.status_code == 201
    body = response.json()
    assert body["verdict_shown"] is None
    assert body["server_verdict"] == "ready_to_escalate"
    assert body["override_reason"] is None


@pytest.mark.parametrize("ticket_id", ["T-Q1", "T-R1"])
@pytest.mark.parametrize("extra", [{}, {"evidence": None}, {"evidence": {}}])
def test_null_verdict_cannot_bypass_override_on_non_p1(client, ticket_id, extra):
    rejected = decide(client, ticket_id, action="escalated", verdict_shown=None, **extra)
    assert rejected.status_code == 422
    accepted = decide(
        client,
        ticket_id,
        action="escalated",
        verdict_shown=None,
        override_reason="Precheck was unavailable",
        **extra,
    )
    assert accepted.status_code == 201
    assert accepted.json()["verdict_shown"] is None


def test_omitted_verdict_with_complete_evidence_needs_no_reason(client):
    response = decide(client, "T-R1", action="escalated", evidence=all_evidence(ROSTER))
    assert response.status_code == 201
    assert response.json()["server_verdict"] == "ready_to_escalate"


def test_decision_rejects_unknown_evidence_key(client):
    response = decide(
        client,
        "T-R1",
        action="escalated",
        verdict_shown="ready_to_escalate",
        evidence={"bogus": True},
    )
    assert response.status_code == 422


def test_l1_tip_is_a_hint_and_needs_no_override(tmp_path):
    rows = [
        escalated(
            f"T-C{index}",
            f"2026-07-{index + 10} 09:00",
            f"2026-07-{index + 10} 18:00",
            CONFIG,
            text="gamma setting looks wrong",
        )
        for index in range(10)
    ]
    rows.append(
        row(
            "T-H1",
            "2026-08-10 09:00",
            text="gamma setting looks wrong",
            first_closed_at="2026-08-10 12:00",
            final_closed_at="2026-08-10 12:00",
        )
    )
    evidence = all_evidence(ROSTER)
    with make_client(write_csv(tmp_path / "hint.csv", rows)) as hint_client:
        body = precheck(hint_client, "T-H1", evidence)
        assert body["verdict"] == "ready_to_escalate"
        assert any(reason.startswith("Hint (non-blocking)") for reason in body["reasons"])
        assert "Optional" in body["suggested_action"]
        decision = decide(
            hint_client,
            "T-H1",
            action="escalated",
            verdict_shown="try_l1_fix",
            evidence=evidence,
        )
        assert decision.status_code == 201
        assert decision.json()["server_verdict"] == "ready_to_escalate"


def test_weekly_metrics_shape_and_totals(client):
    body = client.get("/api/v1/metrics/weekly", headers=HEADERS).json()
    assert body["totals"]["tickets"] == 20
    assert body["totals"]["open"] == 2
    assert sum(week["arrivals"] for week in body["weeks"]) == 20
    assert body["weeks"][0]["partial"] is True
    assert body["weeks"][-1]["partial"] is True
    assert not any(week["in_baseline"] and week["partial"] for week in body["weeks"])
    assert all(week["week_start"] >= "2026-07-19" for week in body["weeks"] if week["in_baseline"])


def test_backtest_reports_guardrails(client):
    body = client.get("/api/v1/metrics/backtest", headers=HEADERS).json()
    assert body["escalations"] == 2
    assert body["p1"]["misses"] == 0
    assert "count" in body["fixed_bugs_delayed"]
    assert sum(body["flagged_by_verdict"].values()) == 2
    assert body["flagged_by_verdict"]["try_l1_fix"] == 0
    assert body["clean_holdout"] is False
    assert body["result_label"] == "revised_not_clean_holdout"
    assert "not a clean holdout" in body["methodology_note"]
    original = body["original_pre_change"]
    assert original["result_label"] == "original_pre_change"
    assert original["clean_holdout"] is False
    assert original["policy_version"] == "2026-11.v1"
    assert original["escalations"] == body["escalations"]
    assert "lift" in body["precision_by_verdict"]["likely_known_issue"]


def test_diagnosis_shape_and_totals(client):
    body = client.get("/api/v1/metrics/diagnosis", headers=HEADERS).json()
    headline = body["headline"]
    assert headline["tickets"] == 20
    assert headline["escalated"] == 16
    assert headline["avoidable"] == 12
    assert headline["bounced"] == 1
    assert sum(month["tickets"] for month in body["months"]) == 20
    assert sum(row["tickets"] for row in body["categories"]) == 20
    assert sum(row["tickets"] for row in body["outcomes"]) == 16
    assert {row["agent"] for row in body["agents"]} == {"Agent Test"}
    assert 0 < headline["open_hours_share_avoidable"] <= headline["open_hours_share_escalated"] <= 1
