"""
NextProblem - Model Training & Evaluation Pipeline
Trains a multi-feature Logistic Regression model on the temporal training set,
compares it with Baseline A (Linear Gap) and Baseline B (Elo Logistic Gap) on the unseen test set,
and saves the evaluation report.

Viva Explanation Notes:
- Standard Scaler:
  Scales each feature x_j to have mean 0 and standard deviation 1:
  z_j = (x_j - mu_j) / sigma_j
  This ensures that rating_gap (~800) does not dominate tag_solve_rate (~0.5) during L2 regularization.
- Logistic Regression Mathematics:
  Probability = 1 / (1 + exp(-(w_0 + sum(w_j * z_j))))
  Weights represent log-odds. A positive weight means increasing that feature increases the probability of solving.
- Calibration:
  A model is well-calibrated if, among instances predicted with probability ~p, the true fraction of positives is close to p.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

from config import FEATURE_COLUMNS, MODELS_DIR, PROCESSED_DATA_DIR, TARGET_COLUMN

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_ModelTrainer")


def evaluate_model(y_true: np.ndarray, y_prob: np.ndarray, model_name: str) -> Dict[str, Any]:
    """Computes AUC, Log Loss, Brier Score, and calibration bins."""
    auc = float(roc_auc_score(y_true, y_prob))
    loss = float(log_loss(y_true, y_prob))
    brier = float(brier_score_loss(y_true, y_prob))

    # Calibration curve with 5 bins
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=5, strategy="uniform")

    return {
        "model_name": model_name,
        "auc": round(auc, 4),
        "log_loss": round(loss, 4),
        "brier_score": round(brier, 4),
        "calibration": {
            "predicted_probabilities": [round(float(p), 4) for p in prob_pred],
            "empirical_probabilities": [round(float(p), 4) for p in prob_true],
        }
    }


def main():
    train_path = PROCESSED_DATA_DIR / "train.csv"
    test_path = PROCESSED_DATA_DIR / "test.csv"

    if not train_path.exists() or not test_path.exists():
        raise FileNotFoundError("Missing train.csv or test.csv. Run build_features.py first.")

    train_df = pd.read_csv(train_path)
    test_df = pd.read_csv(test_path)

    X_train_raw = train_df[FEATURE_COLUMNS].values
    y_train = train_df[TARGET_COLUMN].values

    X_test_raw = test_df[FEATURE_COLUMNS].values
    y_test = test_df[TARGET_COLUMN].values

    logger.info(f"Training on {len(train_df)} samples, testing on {len(test_df)} samples.")
    logger.info(f"Features: {FEATURE_COLUMNS}")

    # 1. Standard Scaler fit only on train
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train_raw)
    X_test = scaler.transform(X_test_raw)

    # 2. Train Logistic Regression
    clf = LogisticRegression(C=1.0, max_iter=1000, random_state=42, solver="lbfgs")
    clf.fit(X_train, y_train)

    # 3. Model Predictions on Test
    y_prob_model = clf.predict_proba(X_test)[:, 1]
    y_prob_model = np.clip(y_prob_model, 1e-6, 1.0 - 1e-6)

    # 4. Baseline Predictions on Test
    gap_test = test_df["rating_gap"].values
    # Baseline A (Linear Gap)
    y_prob_linear = np.clip((gap_test + 800.0) / 1600.0, 0.01, 0.99)
    # Baseline B (Elo Logistic Gap)
    clipped_gap = np.clip(gap_test, -2000.0, 2000.0)
    y_prob_elo = np.clip(1.0 / (1.0 + np.power(10.0, -clipped_gap / 400.0)), 1e-6, 1.0 - 1e-6)

    # 5. Evaluate all three models
    model_metrics = evaluate_model(y_test, y_prob_model, "Multi-Feature Logistic Regression")
    linear_metrics = evaluate_model(y_test, y_prob_linear, "Baseline A (Linear Gap)")
    elo_metrics = evaluate_model(y_test, y_prob_elo, "Baseline B (Elo Logistic Gap)")

    # 6. Feature importance analysis
    weights = clf.coef_[0].tolist()
    intercept = float(clf.intercept_[0])
    means = scaler.mean_.tolist()
    scales = scaler.scale_.tolist()

    feature_analysis = []
    for name, w, m, s in zip(FEATURE_COLUMNS, weights, means, scales):
        impact = "Increases solve probability" if w > 0 else "Decreases solve probability"
        feature_analysis.append({
            "feature": name,
            "standardized_weight": round(float(w), 4),
            "mean": round(float(m), 4),
            "scale": round(float(s), 4),
            "interpretation": impact
        })

    # 7. Comparison Summary
    beats_linear_auc = model_metrics["auc"] > linear_metrics["auc"]
    beats_elo_auc = model_metrics["auc"] > elo_metrics["auc"]
    beats_linear_loss = model_metrics["log_loss"] < linear_metrics["log_loss"]
    beats_elo_loss = model_metrics["log_loss"] < elo_metrics["log_loss"]

    comparison_report = {
        "dataset": {
            "train_samples": len(train_df),
            "test_samples": len(test_df),
            "features_used": FEATURE_COLUMNS,
        },
        "model_parameters": {
            "model_type": "LogisticRegression",
            "solver": "lbfgs",
            "C": 1.0,
            "intercept": round(intercept, 4),
            "feature_weights": feature_analysis,
        },
        "evaluation_metrics": {
            "multi_feature_logistic": model_metrics,
            "baseline_a_linear_gap": linear_metrics,
            "baseline_b_elo_gap": elo_metrics,
        },
        "comparison_verdict": {
            "beats_linear_auc": beats_linear_auc,
            "beats_elo_auc": beats_elo_auc,
            "beats_linear_log_loss": beats_linear_loss,
            "beats_elo_log_loss": beats_elo_loss,
            "delta_auc_vs_linear": round(model_metrics["auc"] - linear_metrics["auc"], 4),
            "delta_auc_vs_elo": round(model_metrics["auc"] - elo_metrics["auc"], 4),
            "delta_loss_vs_linear": round(model_metrics["log_loss"] - linear_metrics["log_loss"], 4),
            "delta_loss_vs_elo": round(model_metrics["log_loss"] - elo_metrics["log_loss"], 4),
        }
    }

    # Save artifacts
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_artifact_path = MODELS_DIR / "logistic_model.joblib"
    scaler_artifact_path = MODELS_DIR / "scaler.joblib"
    report_path = MODELS_DIR / "evaluation_report.json"

    joblib.dump(clf, model_artifact_path)
    joblib.dump(scaler, scaler_artifact_path)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(comparison_report, f, indent=2)

    logger.info("=" * 60)
    logger.info("MODEL EVALUATION COMPARISON REPORT")
    logger.info("=" * 60)
    logger.info(f"{'Model':<35} | {'ROC-AUC':<8} | {'Log Loss':<8} | {'Brier':<8}")
    logger.info("-" * 65)
    logger.info(f"{linear_metrics['model_name']:<35} | {linear_metrics['auc']:<8.4f} | {linear_metrics['log_loss']:<8.4f} | {linear_metrics['brier_score']:<8.4f}")
    logger.info(f"{elo_metrics['model_name']:<35} | {elo_metrics['auc']:<8.4f} | {elo_metrics['log_loss']:<8.4f} | {elo_metrics['brier_score']:<8.4f}")
    logger.info(f"{model_metrics['model_name']:<35} | {model_metrics['auc']:<8.4f} | {model_metrics['log_loss']:<8.4f} | {model_metrics['brier_score']:<8.4f}")
    logger.info("=" * 60)
    logger.info("VERDICT ON BASELINE COMPARISON:")
    logger.info(f"- AUC vs Elo Baseline: {comparison_report['comparison_verdict']['delta_auc_vs_elo']:+.4f} ({'BEATS BASELINE' if beats_elo_auc else 'DOES NOT BEAT'})")
    logger.info(f"- Log Loss vs Elo Baseline: {comparison_report['comparison_verdict']['delta_loss_vs_elo']:+.4f} ({'BEATS BASELINE' if beats_elo_loss else 'DOES NOT BEAT'})")
    logger.info(f"- Log Loss vs Linear Baseline: {comparison_report['comparison_verdict']['delta_loss_vs_linear']:+.4f} ({'BEATS BASELINE' if beats_linear_loss else 'DOES NOT BEAT'})")
    logger.info("=" * 60)
    logger.info("FEATURE WEIGHTS (Standardized Log-Odds):")
    for fa in feature_analysis:
        logger.info(f"  * {fa['feature']:<18}: weight = {fa['standardized_weight']:+.4f} ({fa['interpretation']})")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
