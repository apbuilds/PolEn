"""Configuration for the MacroState Control Room backend."""

import os
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    fred_api_key: str = os.environ.get("FRED_API_KEY", "")
    data_cache_dir: Path = Path(__file__).parent.parent / "data_cache"
    raw_cache_dir: Path = Path(__file__).parent.parent / "data_cache" / "raw"
    processed_cache_dir: Path = Path(__file__).parent.parent / "data_cache" / "processed"

    # FRED series
    fred_series: dict = {
        "SP500": "SP500",
        "DGS2": "DGS2",
        "DGS10": "DGS10",
        "BAA": "BAA",
        "VIXCLS": "VIXCLS",
        "DTWEXBGS": "DTWEXBGS",
        "DGS5": "DGS5",
    }

    # Data lookback years
    data_lookback_years: int = 25

    # Rolling windows
    rolling_zscore_window: int = 252
    rolling_zscore_min_periods: int = 200
    rolling_cov_window: int = 60

    # State space dimensions
    latent_dim: int = 3  # stress, liquidity, growth

    # Regime thresholds for UI label
    regime_threshold_fragile: float = 0.5
    regime_threshold_crisis: float = 1.5

    # Default policy vector B
    default_B: list = [0.003, 0.006, -0.004]

    # Default regime transition matrix (3x3 row-stochastic)
    default_transition_matrix: list = [
        [0.95, 0.05, 0.00],
        [0.05, 0.90, 0.05],
        [0.00, 0.10, 0.90],
    ]

    # Regime noise scales
    regime_noise_scales: list = [1.0, 1.8, 3.0]

    # Monte Carlo defaults
    mc_default_paths: int = 5000
    mc_default_horizon: int = 24
    mc_default_speed_ms: int = 120
    mc_spaghetti_count: int = 30

    # Trading days per month
    trading_days_per_month: int = 21

    # Crisis threshold percentile (of historical filtered stress)
    crisis_threshold_percentile: float = 95.0

    # Shock constants (multiplied by k * sigma)
    shock_credit_stress: float = 0.8
    shock_credit_liquidity: float = 0.5
    shock_vol_stress: float = 1.0
    shock_rate_bps: float = 50.0

    class Config:
        env_prefix = ""


settings = Settings()

# Ensure cache directories exist
settings.raw_cache_dir.mkdir(parents=True, exist_ok=True)
settings.processed_cache_dir.mkdir(parents=True, exist_ok=True)
