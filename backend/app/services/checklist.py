from dataclasses import dataclass

from app.domain.checklists import CHECKLISTS, ChecklistItem


class UnknownEvidenceKeyError(ValueError):
    def __init__(self, keys: list[str]) -> None:
        super().__init__(f"Unknown evidence keys: {', '.join(keys)}")
        self.keys = keys


@dataclass(frozen=True, slots=True)
class ChecklistState:
    key: str
    label: str
    required: bool
    done: bool


def items_for(category: str) -> tuple[ChecklistItem, ...]:
    return CHECKLISTS[category]


def evaluate(category: str, evidence: dict[str, bool]) -> list[ChecklistState]:
    items = items_for(category)
    unknown = sorted(set(evidence) - {item.key for item in items})
    if unknown:
        raise UnknownEvidenceKeyError(unknown)
    return [
        ChecklistState(item.key, item.label, item.required, evidence.get(item.key) is True)
        for item in items
    ]


def missing_required(states: list[ChecklistState]) -> list[ChecklistState]:
    return [state for state in states if state.required and not state.done]
