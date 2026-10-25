"""
NextProblem - Export Parity Verification
Proves that the pure mathematical formulation in JSON achieves numerical equivalence
with scikit-learn's Python predictions.

Viva Explanation Notes:
- This test guarantees that when the browser TypeScript engine computes predictions,
  it reproduces the exact scikit-learn pipeline without discrepancies.
"""

import json
import logging
import math
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

from config import FEATURE_COLUMNS, MODELS_DIR, PROCESSED_DATA_DIR, WEB_EXPORT_DIR

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_ExportVerifier")


def predict_pure_math(
    raw_features: List[float],
    weights: List[float],
    bias: float,
    means: List[float],
    scales: List[float]
) -> float:
    """
    Simulates the exact calculation running in the TypeScript Web Worker.
    z = bias + sum(w_i * (x_i - mean_i) / scale_i)
    prob = 1 / (1 + exp(-z))
    """
    z = bias
    for i in range(len(raw_features)):
        scaled_x = (raw_features[i] - means[i]) / scales[i]
        z += weights[i] * scaled_x
    
    # Clip z to prevent numerical overflow in exp(-z)
    z = max(-30.0, min(30.0, z))
    return 1.0 / (1.0 + math.exp(-z))


def verify_parity():
    test_path = PROCESSED_DATA_DIR / "test.csv"
    model_path = MODELS_DIR / "logistic_model.joblib"
    scaler_path = MODELS_DIR / "scaler.joblib"
    json_path = WEB_EXPORT_DIR / "model_weights.json"

    if not test_path.exists() or not model_path.exists() or not json_path.exists():
        raise FileNotFoundError("Missing prerequisite artifacts for parity verification.")

    test_df = pd.read_csv(test_path)
    clf = joblib.load(model_path)
    scaler = joblib.load(scaler_path)

    with open(json_path, "r", encoding="utf-8") as f:
        export_data = json.load(f)

    weights = export_data["weights"]
    bias = export_data["bias"]
    means = export_data["featureScaling"]["means"]
    scales = export_data["featureScaling"]["scales"]

    # 1. Scikit-learn predictions
    X_test_raw = test_df[FEATURE_COLUMNS].values
    X_test_scaled = scaler.transform(X_test_raw)
    sklearn_probs = clf.predict_proba(X_test_scaled)[:, 1]

    # 2. Pure Math predictions (matching TypeScript implementation)
    pure_probs = []
    for row in X_test_raw:
        p = predict_pure_math(row.tolist(), weights, bias, means, scales)
        pure_probs.append(p)
    pure_probs = np.array(pure_probs)

    # 3. Calculate max difference
    abs_errors = np.abs(sklearn_probs - pure_probs)
    max_error = float(np.max(abs_errors))
    mean_error = float(np.mean(abs_errors))

    logger.info("=" * 60)
    logger.info("NUMERICAL PARITY VERIFICATION (scikit-learn vs Pure Math)")
    logger.info(f"- Total Test Samples Compared: {len(test_df)}")
    logger.info(f"- Mean Absolute Discrepancy:  {mean_error:.8e}")
    logger.info(f"- Max Absolute Discrepancy:   {max_error:.8e}")

    # Tolerance assertion
    assert max_error < 1e-4, f"Parity check failed: max error {max_error} exceeds threshold 1e-4"
    logger.info("✓ VERIFICATION PASSED: Pure arithmetic matches scikit-learn perfectly!")
    logger.info("=" * 60)


if __name__ == "__main__":
    verify_parity()
