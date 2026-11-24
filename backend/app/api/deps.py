import logging
from dataclasses import dataclass
from threading import Lock, Thread

from fastapi import Request

from app.config import Settings
from app.repositories.decisions import DecisionRepository
from app.repositories.tickets import TicketRepository
from app.services.backtest import run_backtest
from app.services.diagnosis import diagnosis
from app.services.ingest import load_tickets
from app.services.metrics import weekly_metrics
from app.services.retrieval import KnowledgeBase

logger = logging.getLogger(__name__)


class ReportNotReady(Exception):
    """A background report is still being computed."""


@dataclass(slots=True)
class DataContext:
    tickets: TicketRepository
    knowledge: KnowledgeBase


class AppState:
    """Loads ticket data on first use and caches derived reports."""

    def __init__(self, settings: Settings, decisions: DecisionRepository) -> None:
        self.settings = settings
        self.decisions = decisions
        self._data: DataContext | None = None
        self._weekly: dict[str, object] | None = None
        self._diagnosis: dict[str, object] | None = None
        self._backtest: dict[str, object] | None = None
        self._lock = Lock()
        self._report_lock = Lock()
        self._backtest_lock = Lock()
        self._warm_lock = Lock()
        self._warm_thread: Thread | None = None

    @property
    def data(self) -> DataContext:
        with self._lock:
            if self._data is None:
                records = load_tickets(self.settings.data_path)
                self._data = DataContext(TicketRepository(records), KnowledgeBase(records))
            return self._data

    def weekly(self) -> dict[str, object]:
        data = self.data
        with self._report_lock:
            if self._weekly is None:
                self._weekly = weekly_metrics(data.tickets.all)
            return self._weekly

    def diagnosis(self) -> dict[str, object]:
        data = self.data
        with self._report_lock:
            if self._diagnosis is None:
                self._diagnosis = diagnosis(data.tickets.all)
            return self._diagnosis

    def backtest(self) -> dict[str, object]:
        if self._backtest is not None:
            return self._backtest
        if self.settings.warm_reports:
            self.warm_backtest()
            raise ReportNotReady
        with self._backtest_lock:
            if self._backtest is None:
                self._compute_backtest()
            return self._backtest

    def warm_backtest(self) -> None:
        """Replay in the background so slow hosts can keep serving requests."""
        with self._warm_lock:
            if self._backtest is not None or self._warm_thread is not None:
                return
            self._warm_thread = Thread(target=self._warm, name="backtest-warmup", daemon=True)
            self._warm_thread.start()

    def _warm(self) -> None:
        try:
            with self._backtest_lock:
                if self._backtest is None:
                    self._compute_backtest()
        except Exception:
            logger.exception("Backtest warmup failed")
        finally:
            with self._warm_lock:
                self._warm_thread = None

    def _compute_backtest(self) -> None:
        data = self.data
        self._backtest = run_backtest(data.tickets.all, data.knowledge)


def get_state(request: Request) -> AppState:
    return request.app.state.container
