"""
API routes for multi-agent policy simulation.

Runs multiple policy agents in parallel from a common starting state
and returns comparative results for side-by-side evaluation.

Supported agents
================
  custom      – user-specified rate change (delta_bps)
  heuristic   – Monte-Carlo stochastic-loss optimizer
  rl          – PPO-trained reinforcement-learning agent
  historical  – actual historical Fed policy (when starting from a real date)
"""

import logging
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.routes_state import get_state_store
from app.config import settings
from app.models.monte_carlo import MonteCarloEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Request model ───────────────────────────────────────────────


class AgentSimRequest(BaseModel):
    agents: List[str] = Field(
        ...,
        description="Agents to run: 'custom', 'heuristic', 'rl', 'historical'.",
    )
    start_date: Optional[str] = Field(
        None,
        description="Historical start date (YYYY-MM-DD). None → current latest state.",
    )
    custom_delta_bps: float = Field(
        default=0.0,
        description="Rate change (bps) for the custom agent.",
    )
    alpha: float = Field(default=1.0, ge=0, le=10)
    beta: float = Field(default=1.0, ge=0, le=10)
    gamma: float = Field(default=1.0, ge=0, le=10)
    lam: float = Field(default=1.0, ge=0, le=10, alias="lambda")
    N: int = Field(default=3000, ge=500, le=10000)
    H: int = Field(default=24, ge=6, le=36)
    regime_switching: bool = Field(default=True)
    shocks: Optional[dict] = Field(default=None)

    class Config:
        populate_by_name = True


# ── Main endpoint ───────────────────────────────────────────────


@router.post("/simulate")
async def multi_agent_simulate(req: AgentSimRequest):
    """
    Run multiple policy agents from a common starting state.

    Returns per-agent metrics *and* forward-path data so the frontend
    can render comparative charts and a ranking table.
    """
    store = get_state_store()
    if not store:
        raise HTTPException(status_code=404, detail="State not initialized.")

    kalman = store["kalman"]

    # ── Resolve starting state ──────────────────────────────────
    if req.start_date:
        snapshots = store.get("historical_snapshots", {})
        snapshot = _resolve_snapshot(snapshots, req.start_date)
        mu_T = np.array(snapshot["mu_T"])
        P_T = np.array(snapshot["P_T"])
        stress_score = snapshot["stress_score"]
    else:
        latest = store["latest_state"]
        mu_T = np.array(latest["mu_T"])
        P_T = np.array(latest["P_T"])
        stress_score = latest["stress_score"]

    latest = store["latest_state"]

    # Shared MC engine from the chosen starting state
    engine = MonteCarloEngine(
        A_daily=kalman.A,
        B_daily=kalman.B,
        Q_daily=kalman.Q,
        mu_T=mu_T,
        P_T=P_T,
        crisis_threshold=latest["crisis_threshold"],
        stress_std=latest["stress_std"],
    )

    # ── Determine each agent's action ───────────────────────────
    agent_actions: dict = {}

    for agent_name in req.agents:
        if agent_name == "custom":
            agent_actions["custom"] = {
                "delta_bps": req.custom_delta_bps,
                "label": f"Custom ({req.custom_delta_bps:+.0f} bps)",
            }

        elif agent_name == "heuristic":
            from app.models.policy import recommend_policy

            rec = recommend_policy(
                engine=engine,
                alpha=req.alpha,
                beta=req.beta,
                gamma=req.gamma,
                lam=req.lam,
                N=min(req.N, 2000),
                H=req.H,
                regime_switching=req.regime_switching,
            )
            agent_actions["heuristic"] = {
                "delta_bps": rec["recommended_bps"],
                "label": (
                    f"Heuristic ({rec['recommended_action']}, "
                    f"{rec['recommended_bps']:+d} bps)"
                ),
            }

        elif agent_name == "rl":
            agent_actions["rl"] = _resolve_rl_action(store, mu_T, stress_score)

        elif agent_name == "historical":
            hist_bps = (
                _get_historical_fed_change(store, req.start_date)
                if req.start_date
                else 0.0
            )
            agent_actions["historical"] = {
                "delta_bps": hist_bps,
                "label": (
                    f"Historical Fed ({hist_bps:+.0f} bps)"
                    if req.start_date
                    else "Historical Fed (Hold — no start date)"
                ),
            }

        else:
            logger.warning(f"Unknown agent requested: {agent_name}")

    # ── Run simulation for every agent ──────────────────────────
    results: dict = {}

    for agent_name, action in agent_actions.items():
        seed = 42 + abs(hash(agent_name)) % 1000

        # Evaluation (loss metrics)
        eval_result = engine.evaluate_policy(
            delta_bps=action["delta_bps"],
            alpha=req.alpha,
            beta=req.beta,
            gamma=req.gamma,
            lam=req.lam,
            N=req.N,
            H=req.H,
            shocks=req.shocks,
            regime_switching=req.regime_switching,
            seed=seed,
        )

        # Streaming data for per-step charts
        sim_steps = engine.simulate_streaming(
            delta_bps=action["delta_bps"],
            N=min(req.N, 2000),
            H=req.H,
            shocks=req.shocks,
            regime_switching=req.regime_switching,
            seed=seed,
        )

        results[agent_name] = {
            "agent": agent_name,
            "label": action["label"],
            "delta_bps": action["delta_bps"],
            "error": action.get("error"),
            "metrics": {
                "mean_stress": round(eval_result["mean_stress"], 4),
                "mean_growth_penalty": round(eval_result["mean_growth_penalty"], 4),
                "mean_es95": round(eval_result["mean_es95"], 4),
                "crisis_end": round(eval_result["crisis_end"], 4),
                "total_loss": round(eval_result["total_loss"], 4),
            },
            "crisis_prob_path": eval_result["crisis_prob_path"],
            "stress_path": [s["stress_fan"]["p50"] for s in sim_steps],
            "growth_path": [s["growth_fan"]["p50"] for s in sim_steps],
            "stress_fan": [s["stress_fan"] for s in sim_steps],
            "growth_fan": [s["growth_fan"] for s in sim_steps],
        }

    return {
        "start_date": req.start_date,
        "agents": results,
        "horizon": req.H,
        "paths": req.N,
    }


# ── Helper functions ────────────────────────────────────────────


def _resolve_snapshot(snapshots: dict, date_str: str) -> dict:
    """Find the snapshot closest to the requested date."""
    if date_str in snapshots:
        return snapshots[date_str]

    from datetime import datetime

    dates = sorted(snapshots.keys())
    if not dates:
        raise HTTPException(status_code=404, detail="No historical snapshots.")

    target = datetime.strptime(date_str, "%Y-%m-%d")
    closest = min(
        dates, key=lambda d: abs(datetime.strptime(d, "%Y-%m-%d") - target)
    )
    return snapshots[closest]


def _resolve_rl_action(
    store: dict, mu_T: np.ndarray, stress_score: float
) -> dict:
    """Try loading the RL model and predicting an action."""
    try:
        from app.policy.rl_policy import RLPolicyEngine

        rl = RLPolicyEngine()
        rl.load_model()

        x_t = np.append(mu_T, store.get("inflation_gap", 0.0)).astype(np.float32)
        regime_idx = 0 if stress_score < 0.5 else (1 if stress_score < 1.5 else 2)
        struct = store.get("structure", {})
        eigenvalues = np.array(
            struct.get("eigenvalues", [0, 0, 0])[:3], dtype=np.float32
        )

        rl_result = rl.predict_from_state(
            x_t=x_t,
            regime=regime_idx,
            last_action=0.0,
            fed_rate=store.get("fed_rate", 0.03),
            eigenvalues=eigenvalues,
            deterministic=True,
        )
        rl_bps = rl_result.get("delta_bps", 0.0)
        return {
            "delta_bps": rl_bps,
            "label": f"RL Agent ({rl_bps:+.0f} bps)",
        }
    except Exception as e:
        logger.warning(f"RL agent unavailable: {e}")
        return {
            "delta_bps": 0.0,
            "label": "RL Agent (unavailable → Hold)",
            "error": str(e),
        }


def _get_historical_fed_change(store: dict, date_str: str) -> float:
    """Look up the actual monthly Fed rate change at a historical date (in bps)."""
    try:
        dm = store.get("data_manager")
        if dm:
            fed = dm.get_fed_rate_series()
            if fed is not None and len(fed) > 1:
                from datetime import datetime

                target = datetime.strptime(date_str, "%Y-%m-%d")
                idx = fed.index.get_indexer([target], method="ffill")[0]
                if 0 < idx < len(fed):
                    rate_now = float(fed.iloc[idx])
                    rate_prev = float(fed.iloc[idx - 1])
                    return round((rate_now - rate_prev) * 10000, 0)
    except Exception as e:
        logger.warning(f"Could not get historical Fed change: {e}")
    return 0.0
