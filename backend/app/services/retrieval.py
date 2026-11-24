"""TF-IDF retrieval over escalations whose outcome was known before the query time."""

from bisect import bisect_left
from collections import Counter, OrderedDict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from threading import Lock

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from app.domain.models import TicketRecord, TriageView

MODEL_CACHE_SIZE = 8


@dataclass(frozen=True, slots=True)
class KnowledgeEntry:
    ticket_id: str
    description: str
    category: str
    eng_outcome: str
    closed_at: datetime


@dataclass(frozen=True, slots=True)
class Match:
    entry: KnowledgeEntry
    similarity: float


@dataclass(frozen=True, slots=True)
class _Model:
    word: TfidfVectorizer
    char: TfidfVectorizer
    word_matrix: object
    char_matrix: object


class KnowledgeBase:
    def __init__(self, tickets: Iterable[TicketRecord]) -> None:
        self._entries = sorted(
            (
                KnowledgeEntry(
                    ticket_id=ticket.ticket_id,
                    description=ticket.description,
                    category=ticket.category,
                    eng_outcome=ticket.eng_outcome,
                    closed_at=ticket.final_closed_at,
                )
                for ticket in tickets
                if ticket.escalated_to_eng and ticket.eng_outcome and ticket.final_closed_at
            ),
            key=lambda entry: (entry.closed_at, entry.ticket_id),
        )
        self._closed_times = [entry.closed_at for entry in self._entries]
        self._models: OrderedDict[int, _Model] = OrderedDict()
        self._lock = Lock()

    def prior_entries(self, before: datetime) -> list[KnowledgeEntry]:
        """Entries closed strictly before the given time."""
        return self._entries[: bisect_left(self._closed_times, before)]

    def category_counts(self, category: str, before: datetime) -> Counter[str]:
        return Counter(
            entry.eng_outcome for entry in self.prior_entries(before) if entry.category == category
        )

    def _model(self, size: int) -> _Model:
        with self._lock:
            cached = self._models.get(size)
            if cached is not None:
                self._models.move_to_end(size)
                return cached
        texts = [entry.description for entry in self._entries[:size]]
        word = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True)
        char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        model = _Model(word, char, word.fit_transform(texts), char.fit_transform(texts))
        with self._lock:
            self._models[size] = model
            while len(self._models) > MODEL_CACHE_SIZE:
                self._models.popitem(last=False)
        return model

    def search(self, query: TriageView, floor: float) -> list[Match]:
        """Same-category prior escalations at or above the floor, best first."""
        size = bisect_left(self._closed_times, query.created_at)
        indices = [
            index for index in range(size) if self._entries[index].category == query.category
        ]
        if not indices:
            return []
        model = self._model(size)
        word_scores = model.word_matrix[indices] @ model.word.transform([query.description]).T
        char_scores = model.char_matrix[indices] @ model.char.transform([query.description]).T
        scores = 0.5 * np.asarray(word_scores.todense()).ravel()
        scores += 0.5 * np.asarray(char_scores.todense()).ravel()
        matches = [
            Match(self._entries[index], round(float(score), 4))
            for index, score in zip(indices, scores, strict=True)
            if score >= floor
        ]
        matches.sort(
            key=lambda match: (
                -match.similarity,
                -match.entry.closed_at.timestamp(),
                match.entry.ticket_id,
            )
        )
        return matches
