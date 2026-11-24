from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import AppState, get_state
from app.auth import require_access_code

router = APIRouter(prefix="/metrics", tags=["metrics"], dependencies=[Depends(require_access_code)])


@router.get("/weekly")
def weekly(state: AppState = Depends(get_state)) -> dict[str, Any]:
    return state.weekly()


@router.get("/diagnosis")
def diagnosis(state: AppState = Depends(get_state)) -> dict[str, Any]:
    return state.diagnosis()


@router.get("/backtest")
def backtest(state: AppState = Depends(get_state)) -> dict[str, Any]:
    return state.backtest()
