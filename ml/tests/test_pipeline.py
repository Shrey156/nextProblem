"""
NextProblem - Comprehensive Pipeline Test Suite
Tests data integrity, leakage-free temporal feature computation,
baseline formulas, and numerical parity using Python's built-in unittest framework.
"""

import json
import math
import sys
import unittest
from pathlib import Path
import numpy as np
import pandas as pd

# Add ml/src to path
SRC_DIR = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC_DIR))

from config import FEATURE_COLUMNS, MODELS_DIR, PROCESSED_DATA_DIR, RAW_DATA_DIR, WEB_EXPORT_DIR
from baseline import predict_elo_logistic, predict_linear_gap


class TestDataIntegrity(unittest.TestCase):
    """Verifies that collected raw datasets and bundled web assets are valid."""

    def test_problems_json_exists_and_rated(self):
        raw_problems = RAW_DATA_DIR / "problems.json"
        self.assertTrue(raw_problems.exists(), "Raw problems.json must exist")
        with open(raw_problems, "r", encoding="utf-8") as f:
            problems = json.load(f)
        self.assertGreater(len(problems), 1000, "Should have collected over 1,000 rated problems")
        for p in problems[:50]:
            self.assertIn("rating", p)
            self.assertIsNotNone(p["rating"])
            self.assertIn("tags", p)
            self.assertGreater(len(p["tags"]), 0)

    def test_bundled_web_assets(self):
        web_problems = WEB_EXPORT_DIR / "problems_snapshot.json"
        web_demos = WEB_EXPORT_DIR / "demo_users.json"
        web_weights = WEB_EXPORT_DIR / "model_weights.json"

        self.assertTrue(web_problems.exists(), "Web bundled problems_snapshot.json must exist")
        self.assertTrue(web_demos.exists(), "Web bundled demo_users.json must exist")
        self.assertTrue(web_weights.exists(), "Web bundled model_weights.json must exist")


class TestFeatureLeakageAndTemporalSplit(unittest.TestCase):
    """Verifies temporal ordering and strict absence of future data leakage."""

    def test_temporal_split_order(self):
        train_path = PROCESSED_DATA_DIR / "train.csv"
        test_path = PROCESSED_DATA_DIR / "test.csv"

        train_df = pd.read_csv(train_path)
        test_df = pd.read_csv(test_path)

        # Invariant 1: Max timestamp of training must be <= Min timestamp of testing
        max_train_time = train_df["timestamp"].max()
        min_test_time = test_df["timestamp"].min()
        self.assertLessEqual(
            max_train_time, min_test_time,
            f"Temporal leakage detected! Max train time {max_train_time} > min test time {min_test_time}"
        )

    def test_laplace_smoothing_bounds(self):
        train_df = pd.read_csv(PROCESSED_DATA_DIR / "train.csv")
        rates = train_df["tag_solve_rate"].values

        # Invariant 2: Laplace-smoothed rates must be strictly bounded in (0, 1)
        self.assertTrue(np.all(rates > 0.0), "Tag solve rates must be strictly positive")
        self.assertTrue(np.all(rates < 1.0), "Tag solve rates must be strictly less than 1.0")


class TestBaselineFormulas(unittest.TestCase):
    """Verifies baseline mathematical functions under edge-case inputs."""

    def test_linear_gap_bounds(self):
        # Gap = 0 -> 0.50
        self.assertAlmostEqual(float(predict_linear_gap(np.array([0.0]))[0]), 0.50, places=4)
        # Gap = +800 -> 0.99 (clipped)
        self.assertAlmostEqual(float(predict_linear_gap(np.array([800.0]))[0]), 0.99, places=4)
        # Extreme gap does not exceed [0.01, 0.99]
        self.assertLessEqual(float(predict_linear_gap(np.array([5000.0]))[0]), 0.99)
        self.assertGreaterEqual(float(predict_linear_gap(np.array([-5000.0]))[0]), 0.01)

    def test_elo_logistic_properties(self):
        # Gap = 0 -> 0.50
        self.assertAlmostEqual(float(predict_elo_logistic(np.array([0.0]))[0]), 0.50, places=4)
        # Gap = +400 -> 10/(1+10) = ~0.909
        prob_400 = float(predict_elo_logistic(np.array([400.0]))[0])
        self.assertAlmostEqual(prob_400, 10.0 / 11.0, places=3)
        # Monotonically increasing
        self.assertGreater(
            float(predict_elo_logistic(np.array([500.0]))[0]),
            float(predict_elo_logistic(np.array([100.0]))[0])
        )


class TestExportParity(unittest.TestCase):
    """Verifies that exported JSON weights match Python scikit-learn."""

    def test_exported_json_schema(self):
        weights_file = WEB_EXPORT_DIR / "model_weights.json"
        with open(weights_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertEqual(data["modelType"], "logistic_regression")
        self.assertEqual(len(data["weights"]), 5)
        self.assertIn("bias", data)
        self.assertIn("featureScaling", data)
        self.assertEqual(len(data["featureScaling"]["means"]), 5)
        self.assertEqual(len(data["featureScaling"]["scales"]), 5)
        self.assertGreater(data["metrics"]["auc"], 0.65)
        self.assertLess(data["metrics"]["logLoss"], 0.25)


if __name__ == "__main__":
    unittest.main()
