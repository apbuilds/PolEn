"""
Monte Carlo simulation engine with Numba acceleration.

Simulates forward paths of the latent macro state under policy actions,
regime switching, and shock injections. Computes fan chart percentiles,
crisis probabilities, and tail risk metrics step by step for live streaming.

Key design decisions:
- Monthly timestep (21 trading days)
- A_monthly ≈ A_daily^21 (matrix power approximation)
- Q_monthly ≈ Q_daily * 21 (noise variance scaling)
- Numba @njit for inner loop; fallback to numpy if Numba unavailable
"""

import logging
from typing import Optional

import numpy as np
from scipy import linalg as la

from app.config import settings
from app.models.regime import RegimeModel

logger = logging.getLogger(__name__)

# Try Numba; fall back gracefully
try:
    from numba import njit, prange

    NUMBA_AVAILABLE = True
except ImportError:
    NUMBA_AVAILABLE = False
    logger.warning("Numba not available; using pure numpy Monte Carlo (slower)")

    # Fallback decorators
    def njit(*args, **kwargs):
        def decorator(func):
            return func
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator

    def prange(*args):
        return range(*args)


def daily_to_monthly_params(
    A_daily: np.ndarray,
    Q_daily: np.ndarray,
    B_daily: np.ndarray,
    days_per_month: int = 21,
) -> tuple:
    """
    Convert daily state-space parameters to monthly frequency.

    A_monthly = A_daily^(days_per_month) via eigendecomposition for stability.
    Q_monthly ≈ sum_{k=0}^{d-1} A^k Q (A^k)^T, approximated as Q_daily * days for simplicity.
    B_monthly = sum_{k=0}^{d-1} A^k B ≈ (I - A^d)(I - A)^{-1} B

    Args:
        A_daily: (n x n) transition matrix
        Q_daily: (n x n) state noise covariance
        B_daily: (n x 1) control input
        days_per_month: trading days per month

    Returns:
        (A_monthly, Q_monthly, B_monthly)
    """
    n = A_daily.shape[0]
    d = days_per_month

    # A_monthly = A^d via eigendecomposition
    try:
        eigenvalues, V = la.eig(A_daily)
        # Power eigenvalues
        lambda_d = eigenvalues ** d
        A_monthly = np.real(V @ np.diag(lambda_d) @ la.inv(V))
    except (la.LinAlgError, ValueError):
        # Fallback: iterative matrix power
        A_monthly = np.linalg.matrix_power(A_daily, d)

    # Q_monthly: geometric series of noise accumulation
    # Q_monthly = sum_{k=0}^{d-1} A^k Q (A^k)^T
    # Approximation for near-identity A: Q_monthly ≈ d * Q
    # Better: use the exact formula via vec() and Kronecker, but approximate for speed
    Q_monthly = np.zeros((n, n))
    A_power = np.eye(n)
    for k in range(d):
        Q_monthly += A_power @ Q_daily @ A_power.T
        A_power = A_power @ A_daily

    Q_monthly = 0.5 * (Q_monthly + Q_monthly.T)  # Ensure symmetry
    Q_monthly += 1e-10 * np.eye(n)

    # B_monthly: sum_{k=0}^{d-1} A^k B
    B_monthly = np.zeros_like(B_daily)
    A_power = np.eye(n)
    for k in range(d):
        B_monthly += A_power @ B_daily
        A_power = A_power @ A_daily

    return A_monthly, Q_monthly, B_monthly


@njit(cache=True)
def _simulate_paths_numba(
    A: np.ndarray,
    B: np.ndarray,
    Q_chol: np.ndarray,
    mu0: np.ndarray,
    P0_chol: np.ndarray,
    delta_bps: float,
    N: int,
    H: int,
    regime_switching: bool,
    Pi_cumsum: np.ndarray,
    noise_scales: np.ndarray,
    initial_regime: int,
    crisis_threshold: float,
    seed: int,
) -> tuple:
    """
    Core Monte Carlo simulation loop (Numba JIT compiled).

    Returns per-step statistics for streaming.
    """
    n = A.shape[0]
    np.random.seed(seed)

    # Output arrays
    stress_p5 = np.zeros(H)
    stress_p25 = np.zeros(H)
    stress_p50 = np.zeros(H)
    stress_p75 = np.zeros(H)
    stress_p95 = np.zeros(H)

    growth_p5 = np.zeros(H)
    growth_p25 = np.zeros(H)
    growth_p50 = np.zeros(H)
    growth_p75 = np.zeros(H)
    growth_p95 = np.zeros(H)

    crisis_prob = np.zeros(H)
    es95_stress = np.zeros(H)

    # Spaghetti paths (first 30)
    n_spag = min(30, N)
    spaghetti = np.zeros((H, n_spag))

    # Control input
    u = np.zeros((1, 1))
    u[0, 0] = delta_bps

    Bu = np.zeros(n)
    for i in range(n):
        Bu[i] = B[i, 0] * delta_bps

    # Initialize N paths
    X = np.zeros((N, n))
    regimes = np.full(N, initial_regime, dtype=np.int64)

    for i in range(N):
        z = np.random.randn(n)
        for j in range(n):
            X[i, j] = mu0[j]
            for k in range(n):
                X[i, j] += P0_chol[j, k] * z[k]

    # Simulate
    stress_vals = np.zeros(N)
    growth_vals = np.zeros(N)

    for step in range(H):
        for i in range(N):
            # Regime transition
            if regime_switching:
                u_rand = np.random.random()
                curr = regimes[i]
                new_regime = 2
                for j in range(3):
                    if u_rand <= Pi_cumsum[curr, j]:
                        new_regime = j
                        break
                regimes[i] = new_regime

            # Noise scaling
            scale = noise_scales[regimes[i]] if regime_switching else 1.0

            # Sample noise
            z = np.random.randn(n)
            noise = np.zeros(n)
            for j in range(n):
                for k in range(n):
                    noise[j] += Q_chol[j, k] * z[k]
                noise[j] *= np.sqrt(scale)

            # Transition
            new_x = np.zeros(n)
            for j in range(n):
                new_x[j] = Bu[j]
                for k in range(n):
                    new_x[j] += A[j, k] * X[i, k]
                new_x[j] += noise[j]

            for j in range(n):
                X[i, j] = new_x[j]

        # Collect statistics
        for i in range(N):
            stress_vals[i] = X[i, 0]
            growth_vals[i] = X[i, 2]

        # Sort for percentiles
        stress_sorted = np.sort(stress_vals)
        growth_sorted = np.sort(growth_vals)

        idx_5 = int(0.05 * N)
        idx_25 = int(0.25 * N)
        idx_50 = int(0.50 * N)
        idx_75 = int(0.75 * N)
        idx_95 = int(0.95 * N)

        stress_p5[step] = stress_sorted[idx_5]
        stress_p25[step] = stress_sorted[idx_25]
        stress_p50[step] = stress_sorted[idx_50]
        stress_p75[step] = stress_sorted[idx_75]
        stress_p95[step] = stress_sorted[idx_95]

        growth_p5[step] = growth_sorted[idx_5]
        growth_p25[step] = growth_sorted[idx_25]
        growth_p50[step] = growth_sorted[idx_50]
        growth_p75[step] = growth_sorted[idx_75]
        growth_p95[step] = growth_sorted[idx_95]

        # Crisis probability
        n_crisis = 0
        for i in range(N):
            if stress_vals[i] > crisis_threshold:
                n_crisis += 1
        crisis_prob[step] = n_crisis / N

        # ES95 stress (expected shortfall: mean of top 5%)
        n_tail = max(1, N - idx_95)
        es_sum = 0.0
        for i in range(idx_95, N):
            es_sum += stress_sorted[i]
        es95_stress[step] = es_sum / n_tail

        # Spaghetti
        for i in range(n_spag):
            spaghetti[step, i] = X[i, 0]

    return (
        stress_p5, stress_p25, stress_p50, stress_p75, stress_p95,
        growth_p5, growth_p25, growth_p50, growth_p75, growth_p95,
        crisis_prob, es95_stress, spaghetti,
    )


def simulate_paths_numpy(
    A: np.ndarray,
    B: np.ndarray,
    Q_chol: np.ndarray,
    mu0: np.ndarray,
    P0_chol: np.ndarray,
    delta_bps: float,
    N: int,
    H: int,
    regime_switching: bool,
    Pi_cumsum: np.ndarray,
    noise_scales: np.ndarray,
    initial_regime: int,
    crisis_threshold: float,
    seed: int,
) -> tuple:
    """Pure numpy fallback (used if Numba not available)."""
    n = A.shape[0]
    rng = np.random.default_rng(seed)

    Bu = (B @ np.array([[delta_bps]])).flatten()

    # Initialize
    Z0 = rng.standard_normal((N, n))
    X = mu0[np.newaxis, :] + Z0 @ P0_chol.T

    regimes = np.full(N, initial_regime, dtype=int)
    n_spag = min(30, N)

    results_per_step = []

    for step in range(H):
        # Regime transitions
        if regime_switching:
            u_rand = rng.random(N)
            new_regimes = np.zeros(N, dtype=int)
            for i in range(N):
                curr = regimes[i]
                for j in range(3):
                    if u_rand[i] <= Pi_cumsum[curr, j]:
                        new_regimes[i] = j
                        break
                else:
                    new_regimes[i] = 2
            regimes = new_regimes

        # Noise
        Z = rng.standard_normal((N, n))
        if regime_switching:
            scales = noise_scales[regimes]
            noise = (Z @ Q_chol.T) * np.sqrt(scales[:, np.newaxis])
        else:
            noise = Z @ Q_chol.T

        # Transition
        X = X @ A.T + Bu[np.newaxis, :] + noise

        # Statistics
        stress = X[:, 0]
        growth = X[:, 2]

        stress_sorted = np.sort(stress)
        growth_sorted = np.sort(growth)

        stress_fan = {
            "p5": float(np.percentile(stress, 5)),
            "p25": float(np.percentile(stress, 25)),
            "p50": float(np.percentile(stress, 50)),
            "p75": float(np.percentile(stress, 75)),
            "p95": float(np.percentile(stress, 95)),
        }
        growth_fan = {
            "p5": float(np.percentile(growth, 5)),
            "p25": float(np.percentile(growth, 25)),
            "p50": float(np.percentile(growth, 50)),
            "p75": float(np.percentile(growth, 75)),
            "p95": float(np.percentile(growth, 95)),
        }

        cp = float(np.mean(stress > crisis_threshold))
        top5_idx = int(0.95 * N)
        es95 = float(np.mean(stress_sorted[top5_idx:]))

        spaghetti_step = [
            {"id": int(i), "stress": float(X[i, 0])} for i in range(n_spag)
        ]

        results_per_step.append({
            "step": step + 1,
            "stress_fan": stress_fan,
            "growth_fan": growth_fan,
            "crisis_prob": cp,
            "es95_stress": es95,
            "spaghetti": spaghetti_step,
        })

    return results_per_step


class MonteCarloEngine:
    """
    Monte Carlo simulation engine for policy evaluation.

    Supports both Numba-accelerated and pure numpy backends.
    Provides step-by-step results for WebSocket streaming and
    batch results for policy recommendation.
    """

    def __init__(
        self,
        A_daily: np.ndarray,
        B_daily: np.ndarray,
        Q_daily: np.ndarray,
        mu_T: np.ndarray,
        P_T: np.ndarray,
        crisis_threshold: float,
        stress_std: float = 1.0,
    ):
        self.n = A_daily.shape[0]
        self.crisis_threshold = crisis_threshold
        self.stress_std = stress_std

        # Convert to monthly
        self.A_monthly, self.Q_monthly, self.B_monthly = daily_to_monthly_params(
            A_daily, Q_daily, B_daily, settings.trading_days_per_month
        )

        self.mu_T = np.array(mu_T)
        self.P_T = np.array(P_T)

        # Cholesky decompositions for sampling
        self.Q_chol = np.linalg.cholesky(
            self.Q_monthly + 1e-8 * np.eye(self.n)
        )
        self.P0_chol = np.linalg.cholesky(
            self.P_T + 1e-8 * np.eye(self.n)
        )

        self.regime_model = RegimeModel()

    def apply_shocks(
        self,
        mu0: np.ndarray,
        shocks: dict,
    ) -> tuple:
        """
        Apply shock injections to initial state.

        Args:
            mu0: initial state mean
            shocks: dict with keys "credit", "vol", "rate" and intensity values (in sigma units)

        Returns:
            (modified_mu0, additional_bps)
        """
        mu = mu0.copy()
        extra_bps = 0.0

        sigma = self.stress_std

        if "credit" in shocks and shocks["credit"] != 0:
            k = shocks["credit"]
            mu[0] += settings.shock_credit_stress * k * sigma
            mu[1] += settings.shock_credit_liquidity * k * sigma

        if "vol" in shocks and shocks["vol"] != 0:
            k = shocks["vol"]
            mu[0] += settings.shock_vol_stress * k * sigma

        if "rate" in shocks and shocks["rate"] != 0:
            k = shocks["rate"]
            extra_bps += settings.shock_rate_bps * k

        return mu, extra_bps

    def simulate_streaming(
        self,
        delta_bps: float = 0.0,
        N: int = 5000,
        H: int = 24,
        shocks: dict = None,
        regime_switching: bool = True,
        seed: int = 42,
    ) -> list[dict]:
        """
        Run full simulation and return per-step results for streaming.

        Returns list of dicts, one per timestep.
        """
        mu0 = self.mu_T.copy()
        extra_bps = 0.0

        if shocks:
            mu0, extra_bps = self.apply_shocks(mu0, shocks)

        total_bps = delta_bps + extra_bps
        initial_regime = self.regime_model.initial_regime(mu0[0])

        Pi_cumsum = self.regime_model.Pi_cumsum
        noise_scales = self.regime_model.scales

        # Try Numba path first
        if NUMBA_AVAILABLE:
            try:
                result = _simulate_paths_numba(
                    self.A_monthly, self.B_monthly, self.Q_chol,
                    mu0, self.P0_chol, total_bps,
                    N, H, regime_switching,
                    Pi_cumsum, noise_scales, initial_regime,
                    self.crisis_threshold, seed,
                )

                (sp5, sp25, sp50, sp75, sp95,
                 gp5, gp25, gp50, gp75, gp95,
                 crisis_prob, es95, spaghetti) = result

                steps = []
                n_spag = min(30, N)
                for step in range(H):
                    spag = [
                        {"id": int(i), "stress": float(spaghetti[step, i])}
                        for i in range(n_spag)
                    ]
                    steps.append({
                        "step": step + 1,
                        "H": H,
                        "stress_fan": {
                            "p5": float(sp5[step]),
                            "p25": float(sp25[step]),
                            "p50": float(sp50[step]),
                            "p75": float(sp75[step]),
                            "p95": float(sp95[step]),
                        },
                        "growth_fan": {
                            "p5": float(gp5[step]),
                            "p25": float(gp25[step]),
                            "p50": float(gp50[step]),
                            "p75": float(gp75[step]),
                            "p95": float(gp95[step]),
                        },
                        "crisis_prob": float(crisis_prob[step]),
                        "es95_stress": float(es95[step]),
                        "spaghetti": spag,
                    })
                return steps
            except Exception as e:
                logger.warning(f"Numba simulation failed, falling back to numpy: {e}")

        # Numpy fallback
        results = simulate_paths_numpy(
            self.A_monthly, self.B_monthly, self.Q_chol,
            mu0, self.P0_chol, total_bps,
            N, H, regime_switching,
            Pi_cumsum, noise_scales, initial_regime,
            self.crisis_threshold, seed,
        )

        for r in results:
            r["H"] = H

        return results

    def evaluate_policy(
        self,
        delta_bps: float,
        alpha: float = 1.0,
        beta: float = 1.0,
        gamma: float = 1.0,
        lam: float = 1.0,
        N: int = 5000,
        H: int = 24,
        shocks: dict = None,
        regime_switching: bool = True,
        seed: int = 42,
    ) -> dict:
        """
        Evaluate a single policy action and compute loss components.

        Loss = alpha * mean_stress + beta * growth_penalty + gamma * ES95 + lambda * crisis_end

        Returns dict with loss breakdown.
        """
        steps = self.simulate_streaming(
            delta_bps=delta_bps, N=N, H=H, shocks=shocks,
            regime_switching=regime_switching, seed=seed,
        )

        # Aggregate metrics across steps
        mean_stress = np.mean([s["stress_fan"]["p50"] for s in steps])
        # Growth penalty: penalize negative growth
        mean_growth_penalty = np.mean([max(0, -s["growth_fan"]["p50"]) for s in steps])
        mean_es95 = np.mean([s["es95_stress"] for s in steps])
        crisis_end = steps[-1]["crisis_prob"]

        total_loss = (
            alpha * mean_stress
            + beta * mean_growth_penalty
            + gamma * mean_es95
            + lam * crisis_end
        )

        return {
            "delta_bps": delta_bps,
            "mean_stress": float(mean_stress),
            "mean_growth_penalty": float(mean_growth_penalty),
            "mean_es95": float(mean_es95),
            "crisis_end": float(crisis_end),
            "total_loss": float(total_loss),
            "crisis_prob_path": [float(s["crisis_prob"]) for s in steps],
        }
