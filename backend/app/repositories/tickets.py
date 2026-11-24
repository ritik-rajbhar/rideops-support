from collections.abc import Sequence

from app.domain.models import TicketRecord


class TicketRepository:
    """Read-only ticket access, newest first."""

    def __init__(self, tickets: Sequence[TicketRecord]) -> None:
        self._tickets = sorted(tickets, key=lambda t: (t.created_at, t.ticket_id), reverse=True)
        self._by_id = {ticket.ticket_id: ticket for ticket in self._tickets}

    @property
    def all(self) -> Sequence[TicketRecord]:
        return self._tickets

    def get(self, ticket_id: str) -> TicketRecord | None:
        return self._by_id.get(ticket_id)

    def search(
        self,
        *,
        status: str = "all",
        agent: str | None = None,
        category: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TicketRecord], int]:
        needle = q.casefold() if q else None
        found = [
            ticket
            for ticket in self._tickets
            if (status != "open" or ticket.is_open)
            and (not agent or ticket.assigned_agent == agent)
            and (not category or ticket.category == category)
            and (not priority or ticket.priority == priority)
            and (
                needle is None
                or needle in ticket.description.casefold()
                or needle in ticket.ticket_id.casefold()
                or needle in ticket.client_name.casefold()
            )
        ]
        return found[offset : offset + limit], len(found)
