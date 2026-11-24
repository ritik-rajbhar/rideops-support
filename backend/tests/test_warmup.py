from threading import Event

from fastapi.testclient import TestClient

import app.api.deps as deps
from app.config import Settings
from app.main import create_app
from tests.conftest import ACCESS_CODE

HEADERS = {"X-Access-Code": ACCESS_CODE}


def test_backtest_warms_without_blocking_other_reports(data_path, monkeypatch):
    release = Event()
    finished = Event()

    def slow_backtest(*_):
        release.wait(timeout=5)
        finished.set()
        return {"result_label": "ready"}

    monkeypatch.setattr(deps, "run_backtest", slow_backtest)
    settings = Settings(
        ACCESS_CODE=ACCESS_CODE,
        RIDEOPS_DATA_PATH=str(data_path),
        DATABASE_URL="sqlite://",
        WARM_REPORTS=True,
        _env_file=None,
    )

    with TestClient(create_app(settings)) as client:
        pending = client.get("/api/v1/metrics/backtest", headers=HEADERS)
        assert pending.status_code == 503
        assert pending.headers["retry-after"] == "5"
        assert client.get("/api/v1/metrics/weekly", headers=HEADERS).status_code == 200

        release.set()
        assert finished.wait(timeout=5)
        thread = client.app.state.container._warm_thread
        if thread is not None:
            thread.join(timeout=5)

        ready = client.get("/api/v1/metrics/backtest", headers=HEADERS)
        assert ready.status_code == 200
        assert ready.json() == {"result_label": "ready"}
