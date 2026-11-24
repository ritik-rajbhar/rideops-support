from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, Text, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


class DecisionRow(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(32))
    verdict_shown: Mapped[str | None] = mapped_column(String(32), nullable=True)
    server_verdict: Mapped[str] = mapped_column(String(32))
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        options: dict[str, object] = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url == "sqlite://":
            options["poolclass"] = StaticPool
        return create_engine(url, **options)
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)


class DecisionRepository:
    def __init__(self, engine: Engine) -> None:
        self._sessions = sessionmaker(engine, expire_on_commit=False)
        self._engine = engine

    def create_schema(self) -> None:
        Base.metadata.create_all(self._engine)

    def add(
        self,
        *,
        ticket_id: str,
        action: str,
        verdict_shown: str | None,
        server_verdict: str,
        override_reason: str | None,
        agent: str,
    ) -> DecisionRow:
        row = DecisionRow(
            ticket_id=ticket_id,
            action=action,
            verdict_shown=verdict_shown,
            server_verdict=server_verdict,
            override_reason=override_reason,
            agent=agent,
            created_at=datetime.now(UTC),
        )
        with self._sessions.begin() as session:
            session.add(row)
        return row
