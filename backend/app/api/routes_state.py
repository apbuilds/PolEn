"""
API routes for state management and data status.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["state"])

# Shared state store (populated by refresh)
_state_store: dict = {}


def get_state_store() -> dict:
    return _state_store


@router.get("/health")
async def health():
    return {"ok": True}


@router.get("/data/status")
async def data_status():
    """Return status of cached data."""
    from app.data.fred_client import FREDClient
    client = FREDClient()
    status = client.get_cache_status()
    return {
        "has_fred_key": client.has_key,
        "series": status,
    }


@router.post("/state/refresh")
async def refresh_state(synthetic: bool = False):
    """
    Refresh data, preprocess, compute structure features, and run Kalman+EM.
    """
    global _state_store
    try:
        from app.data.pipeline import DataPipeline
        from app.models.structure_features import compute_structure_features
        from app.models.kalman_em import KalmanEM

        # Step 1: Run data pipeline
        pipeline = DataPipeline()
        use_synthetic = synthetic or pipeline.is_synthetic
        df = pipeline.refresh(synthetic=use_synthetic)

        logger.info(f"Data pipeline complete: {len(df)} rows, cols={df.columns.tolist()}")

        # Step 2: Compute structure features
        struct = compute_structure_features(df, window=settings.rolling_cov_window)

        logger.info(f"Structure features computed: Z_t dim={len(struct['Z_t'])}")

        # Step 3: Run Kalman + EM
        Z_history = struct["Z_history"].values
        kalman = KalmanEM(latent_dim=settings.latent_dim)
        fit_result = kalman.fit(Z_history)

        # Step 4: Get latest state
        latest_state = kalman.get_latest_state()

        # Store everything
        _state_store = {
            "df": df,
            "structure": struct,
            "kalman": kalman,
            "fit_result": fit_result,
            "latest_state": latest_state,
            "latest_date": str(df.index[-1].date()),
            "is_synthetic": use_synthetic,
        }

        return {
            "status": "ok",
            "latest_date": _state_store["latest_date"],
            "regime_label": latest_state["regime_label"],
            "stress_score": latest_state["stress_score"],
            "data_points": len(df),
            "is_synthetic": use_synthetic,
        }

    except Exception as e:
        logger.exception("Failed to refresh state")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/state/current")
async def get_current_state():
    """
    Return the current inferred macro state and structure metrics.
    """
    if not _state_store:
        raise HTTPException(
            status_code=404,
            detail="State not initialized. Call POST /api/state/refresh first.",
        )

    latest = _state_store["latest_state"]
    struct = _state_store["structure"]

    return {
        "latest_date": _state_store["latest_date"],
        "is_synthetic": _state_store.get("is_synthetic", False),
        "mu_T": latest["mu_T"],
        "P_T": latest["P_T"],
        "stress_score": latest["stress_score"],
        "regime_label": latest["regime_label"],
        "crisis_threshold": latest["crisis_threshold"],
        "metrics": struct["metrics"],
        "correlation_matrix": [row.tolist() for row in struct["R_t"]],
        "correlation_labels": struct["labels"],
        "eigenvalues": struct["eigenvalues"],
    }
