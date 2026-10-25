"""
NextProblem - Model Exporter
Extracts weights, bias, feature scaling factors, and metrics into a lightweight JSON file
for zero-runtime browser inference.

Viva Explanation Notes:
- Why export to JSON instead of ONNX or Pickle?
  1. Pickle is insecure and requires a Python runtime.
  2. ONNX requires heavy WebAssembly binaries (~10-20 MB download).
  3. Logistic Regression is mathematically elementary:
     Inference is simply: sigmoid(bias + dot_product(weights, (features - means) / scales))
     A ~2 KB JSON file contains everything needed to evaluate problems in microseconds.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import joblib

from config import FEATURE_COLUMNS, MODELS_DIR, WEB_EXPORT_DIR

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_ModelExporter")


def export_model():
    model_path = MODELS_DIR / "logistic_model.joblib"
    scaler_path = MODELS_DIR / "scaler.joblib"
    report_path = MODELS_DIR / "evaluation_report.json"

    if not model_path.exists() or not scaler_path.exists() or not report_path.exists():
        raise FileNotFoundError("Missing trained model artifacts. Run train_evaluate.py first.")

    clf = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    weights = [round(float(w), 6) for w in clf.coef_[0]]
    bias = round(float(clf.intercept_[0]), 6)
    means = [round(float(m), 6) for m in scaler.mean_]
    scales = [round(float(s), 6) for s in scaler.scale_]

    model_metrics = report["evaluation_metrics"]["multi_feature_logistic"]
    linear_metrics = report["evaluation_metrics"]["baseline_a_linear_gap"]
    elo_metrics = report["evaluation_metrics"]["baseline_b_elo_gap"]

    export_payload = {
        "modelType": "logistic_regression",
        "version": "1.0.0",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "featureNames": FEATURE_COLUMNS,
        "weights": weights,
        "bias": bias,
        "featureScaling": {
            "means": means,
            "scales": scales,
        },
        "metrics": {
            "auc": model_metrics["auc"],
            "logLoss": model_metrics["logLoss"] if "logLoss" in model_metrics else model_metrics.get("log_loss", 0),
            "brierScore": model_metrics["brierScore"] if "brierScore" in model_metrics else model_metrics.get("brier_score", 0),
        },
        "baselineMetrics": {
            "gapBaselineAuc": linear_metrics["auc"],
            "gapBaselineLogLoss": linear_metrics.get("log_loss", 0),
            "eloLogisticAuc": elo_metrics["auc"],
            "eloLogisticLogLoss": elo_metrics.get("log_loss", 0),
        },
        "calibration": model_metrics.get("calibration", {}),
        "comparisonVerdict": report.get("comparison_verdict", {}),
    }

    # 1. Save to ml/models/
    ml_export_path = MODELS_DIR / "model_weights.json"
    with open(ml_export_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, indent=2)

    # 2. Save directly to web/public/data/ for zero-bundle browser access
    WEB_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    web_export_path = WEB_EXPORT_DIR / "model_weights.json"
    with open(web_export_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, indent=2)

    file_size_bytes = web_export_path.stat().st_size
    file_size_kb = file_size_bytes / 1024.0

    logger.info("=" * 60)
    logger.info("MODEL EXPORT SUCCESSFUL")
    logger.info(f"- Model Type: {export_payload['modelType']}")
    logger.info(f"- Features: {len(FEATURE_COLUMNS)} {FEATURE_COLUMNS}")
    logger.info(f"- Bias (Intercept): {bias:+.6f}")
    logger.info(f"- Weights: {weights}")
    logger.info(f"- Saved to: {web_export_path}")
    logger.info(f"- Measured Export Size: {file_size_bytes} bytes ({file_size_kb:.2f} KB)")
    logger.info("=" * 60)

    return file_size_bytes


if __name__ == "__main__":
    export_model()
