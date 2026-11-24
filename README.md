# RideOps Pre-Escalation Check

An internal tool for **L1 support agents** at RideOps. Before a ticket goes to engineering, it checks whether the ticket is ready, whether it looks like a known issue, and what evidence is still missing.

**Live app:** _add your hosted link here_ (no login needed; the first load can take up to a minute while the free API server wakes up)

## The problem in one paragraph

Open tickets rose from a 7-day average of 29 (late July) to 50 (late September). Intake grew 52% (390 tickets in July, 592 in September) and there is no budget to hire. The biggest lever left is wasted time: **52% of escalations (253 of 486) came back from engineering without a fix** (missing info, config, how-to or duplicate). Escalated tickets are 34% of all tickets but hold **71% of open ticket-hours**; avoidable escalations alone hold **45%**. An escalation bounced back for missing info or config takes a median **128 hours** to close, against 65 hours for a real bug and 13 hours for a ticket kept at L1, and its CSAT is 2.55 against 4.01.

## What the app does

| Page | For | What it shows |
| --- | --- | --- |
| **Queue** | L1 agent | Open tickets, highest priority and oldest first, with search and filters. |
| **Ticket check** | L1 agent | A category checklist, a verdict (`likely known issue`, `needs info` or `ready to escalate`), the reasons, and similar past escalations with their outcomes. The agent records the decision; escalating against the advice needs a one-line reason. |
| **Diagnosis** | Support lead, head of ops | Why the backlog grows, computed live from the data: outcomes, categories, agents, and each interview claim checked against the numbers. |
| **Impact** | Support lead, head of ops | Weekly success measures and guardrails, plus a replay of the check on September escalations. |

Rules that keep it safe:

- **Advisory only.** The agent decides and can always escalate.
- **P1 tickets are never held.**
- **No leakage.** Verdicts use only fields known at triage, and history only from tickets closed before the ticket was created.
- Every decision is logged with the verdict shown, so adoption and overrides can be measured.

## How "better" is measured

- **Primary:** 7-day average of open tickets (the number leadership watches).
- **Driver:** avoidable escalation share (what the tool moves directly).
- **Guardrails:** reopen rate, P1/P2 median close time, CSAT, and real bugs delayed by the check.

All of these are on the Impact page, week by week.

## Replay result (honest version)

September replay of 189 escalations: 25 held as likely known issues, 15 of them truly avoidable; 10 of 78 real bugs would have been delayed; 0 of 9 P1s held. The missing-information check could not be replayed, because past checklist evidence was never recorded; that check is what targets the largest avoidable group (89 "insufficient info" returns). One rule was turned into a non-blocking hint after its September precision was seen, so the replay is not a clean holdout.

## Architecture

```text
Browser -> Next.js web app -> FastAPI -> tickets CSV (read-only)
           (server proxy)            -> SQLite or Postgres (agent decisions)
```

- `backend/`: FastAPI service. Precheck rules, TF-IDF similar-ticket search, weekly metrics, diagnosis and replay.
- `web/`: Next.js app. A server-side proxy adds the access code, so the browser never sees it.

## Run locally

Needs Python 3.12, Node 20.19 or later, and the case study CSV (keep it outside git).

API:

```bash
cd backend
python -m venv .venv              # Python 3.12
.venv/bin/pip install -r requirements-dev.txt     # Windows: .venv\Scripts\pip
cp .env.example .env              # set ACCESS_CODE and RIDEOPS_DATA_PATH
.venv/bin/uvicorn app.main:app --port 8000
```

Web, in a second terminal:

```bash
cd web
npm ci
cp .env.example .env.local        # set the same ACCESS_CODE
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Service | Variable | Purpose |
| --- | --- | --- |
| API | `ACCESS_CODE` | Shared secret required on API requests |
| API | `RIDEOPS_DATA_PATH` | Absolute path to the tickets CSV |
| API | `DATABASE_URL` | SQLite by default, or a `postgresql://` URL |
| Web | `API_BASE_URL` | API base URL, without `/api/v1` |
| Web | `ACCESS_CODE` | Same value as the API; used only by the server proxy |

## Tests

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd web && npm test && npm run lint && npm run typecheck
```

## Deploy

- **API on Render:** `render.yaml` defines a free Docker service. Upload the CSV as a secret file named `rideops_support_tickets.csv` and set `ACCESS_CODE`.
- **Web on Vercel:** import the repo with root directory `web`, and set `API_BASE_URL` (the Render URL) and `ACCESS_CODE`.
- Free-tier SQLite is wiped on restart. Set a Postgres `DATABASE_URL` to keep decisions.

## Known limits

- One 13-week snapshot; early July understates the backlog because the file starts empty.
- Engineering effort and queue time are not in the data, so hours saved are estimates.
- The missing-information verdict has not been backtested.
- Ticket descriptions are short templates, so similar-ticket matches are thin evidence.
- The demo is open to anyone with the link. Production would need per-user sign-in.
