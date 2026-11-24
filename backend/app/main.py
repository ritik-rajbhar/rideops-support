from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.api.deps import AppState, ReportNotReady
from app.api.routes import health, metrics, tickets
from app.config import Settings
from app.repositories.decisions import DecisionRepository, build_engine
from app.services.ingest import DataLoadError

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or Settings()
    engine = build_engine(resolved.database_url)
    decisions = DecisionRepository(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        decisions.create_schema()
        if resolved.warm_reports:
            container.warm_backtest()
        yield
        engine.dispose()

    app = FastAPI(title="RideOps Pre-Escalation Check", version="0.1.0", lifespan=lifespan)
    container = AppState(resolved, decisions)
    app.state.settings = resolved
    app.state.container = container

    @app.exception_handler(ReportNotReady)
    async def report_not_ready(_: Request, __: ReportNotReady) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Backtest is still computing"},
            headers={"Retry-After": "5"},
        )

    @app.exception_handler(DataLoadError)
    async def data_unavailable(_: Request, __: DataLoadError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Ticket data is unavailable"},
        )

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(tickets.router, prefix=API_PREFIX)
    app.include_router(metrics.router, prefix=API_PREFIX)
    return app


app = create_app()
