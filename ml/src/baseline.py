"""
NextProblem - Baseline Models & Evaluation
Implements and evaluates:
1. Baseline A: Linear Rating Gap Heuristic
2. Baseline B: Elo-style Logistic Model on Rating Gap

Viva Explanation Notes:
- Why evaluate baselines?
  In empirical ML, you cannot claim a model is useful simply because it has high accuracy.
  You must demonstrate that your feature engineering (tag solve rates, tag attempts)
  actually OUTPERFORMS simple domain heuristics (the rating gap alone).
- Baseline A (Linear Gap):
  Direct proportional mapping: if rating gap is 0, probability is 50%.
  If gap >= +800, probability approaches 99%. If gap <= -800, probability approaches 1%.
- Baseline B (Elo Logistic):
  Standard competitive rating formula used in chess and gaming:
  P(solve) = 1 / (1 + 10^(-gap / 400)).
"""

import json
import logging
from pathlib import Path
from typing import Dict, Tuple
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from config import MODELS_DIR, PROCESSED_DATA_DIR, TARGET_COLUMN

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_Baselines")


def predict_linear_gap(rating_gap: np.ndarray) -> np.ndarray:
    """
    Baseline A: Linear mapping of rating gap to probability with clipping.
    Gap in [-800, +800] -> Prob in [0.01, 0.99].
    """
    prob = (rating_gap + 800.0) / 1600.0
    return np.clip(prob, 0.01, 0.99)


def predict_elo_logistic(rating_gap: np.ndarray) -> np.ndarray:
    """
    Baseline B: Elo expected score formula.
    P = 1 / (1 + 10^(-gap / 400))
    """
    # Clip extreme gaps to prevent float overflow
    clipped_gap = np.clip(rating_gap, -2000.0, 2000.0)
    exponent = -clipped_gap / 400.0
    prob = 1.0 / (1.0 + np.power(10.0, exponent))
    return np.clip(prob, 1e-6, 1.0 - 1e-6)


def evaluate_predictions(y_true: np.ndarray, y_prob: np.ndarray, model_name: str) -> Dict[str, float]:
    """Computes ROC-AUC, Log Loss, and Brier Calibration Score."""
    auc = float(roc_auc_score(y_true, y_prob))
    loss = float(log_loss(y_true, y_prob))
    brier = float(brier_score_loss(y_true, y_prob))

    logger.info(f"[{model_name}]")
    logger.info(f"  - ROC-AUC:     {auc:.4f}  (Higher is better, 0.50 = random chance)")
    logger.info(f"  - Log Loss:    {loss:.4f}  (Lower is better)")
    logger.info(f"  - Brier Score: {brier:.4f}  (Lower is better calibration)")

    return {
        "model_name": model_name,
        "auc": round(auc, 4),
        "log_loss": round(loss, 4),
        "brier_score": round(brier, 4)
    }


def main():
    test_path = PROCESSED_DATA_DIR / "test.csv"
    train_path = PROCESSED_DATA_DIR / "train.csv"

    if not test_path.exists() or not train_path.exists():
        raise FileNotFoundError("Missing train.csv or test.csv. Run build_features.py first.")

    train_df = pd.read_csv(train_path)
    test_df = pd.read_csv(test_path)

    y_test = test_df[TARGET_COLUMN].values
    gap_test = test_df["rating_gap"].values

    logger.info(f"Evaluating baselines on unseen temporal test set ({len(test_df)} samples)...")

    # 1. Baseline A: Linear Gap Heuristic
    prob_linear = predict_linear_gap(gap_test)
    metrics_linear = evaluate_predictions(y_test, prob_linear, "Baseline A (Linear Gap)")

    # 2. Baseline B: Elo-style Logistic Gap
    prob_elo = predict_elo_logistic(gap_test)
    metrics_elo = evaluate_predictions(y_test, prob_elo, "Baseline B (Elo Logistic Gap)")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    baseline_output_path = MODELS_DIR / "baseline_results.json"
    with open(baseline_output_path, "w", encoding="utf-8") as f:
        json.dump({
            "test_sample_count": len(test_df),
            "linear_gap_baseline": metrics_linear,
            "elo_logistic_baseline": metrics_elo
        }, f, indent=2)

    logger.info(f"Baseline results saved to {baseline_output_path}")


if __name__ == "__main__":
    main()
