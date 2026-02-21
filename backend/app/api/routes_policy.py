"""
API routes for policy recommendation.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.routes_state import get_state_store
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["policy"])


class RecommendRequest(BaseModel):
    alpha: float = Field(default=1.0, ge=0, le=10, description="Stress weight")
    beta: float = Field(default=1.0, ge=0, le=10, description="Growth penalty weight")
    gamma: float = Field(default=1.0, ge=0, le=10, description="Tail risk (ES95) weight")
    lam: float = Field(default=1.0, ge=0, le=10, description="Crisis end weight", alias="lambda")
    N: int = Field(default=5000, ge=500, le=10000, description="Monte Carlo paths")
    H: int = Field(default=24, ge=6, le=36, description="Horizon months")
    delta_bps_custom: Optional[float] = Field(default=None, description="Custom bps to evaluate")
    shocks: Optional[dict] = Field(default=None, description="Shock injections")
    regime_switching: bool = Field(default=True, description="Enable regime switching")

    class Config:
        populate_by_name = True


@router.post("/policy/recommend")
async def recommend(req: RecommendRequest):
    """
    Run policy recommendation: evaluate Ease/Hold/Tighten and return comparison + recommendation.
    """
    store = get_state_store()
    if not store:
        raise HTTPException(
            status_code=404,
            detail="State not initialized. Call POST /api/state/refresh first.",
        )

    try:
        import numpy as np
        from app.models.monte_carlo import MonteCarloEngine
        from app.models.policy import recommend_policy

        kalman = store["kalman"]
        latest = store["latest_state"]

        engine = MonteCarloEngine(
            A_daily=kalman.A,
            B_daily=kalman.B,
            Q_daily=kalman.Q,
            mu_T=np.array(latest["mu_T"]),
            P_T=np.array(latest["P_T"]),
            crisis_threshold=latest["crisis_threshold"],
            stress_std=latest["stress_std"],
        )

        result = recommend_policy(
            engine=engine,
            alpha=req.alpha,
            beta=req.beta,
            gamma=req.gamma,
            lam=req.lam,
            N=req.N,
            H=req.H,
            shocks=req.shocks,
            regime_switching=req.regime_switching,
            delta_bps_custom=req.delta_bps_custom,
        )

        return result

    except Exception as e:
        logger.exception("Policy recommendation failed")
        raise HTTPException(status_code=500, detail=str(e))
