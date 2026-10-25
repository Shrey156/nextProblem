"""
NextProblem - Feature Engineering & Temporal Split Pipeline

Viva Explanation Notes:
- Leakage Prevention:
  1. We predict whether a user solves problem P at the exact moment of their first attempt (t_first).
  2. Features (tag_solve_rate, tag_attempts) are strictly calculated from problems attempted
     BEFORE t_first. Future problems or future attempts on other problems cannot leak into the past.
  3. We apply Laplace Smoothing ((solved + 1) / (attempts + 2)) so zero-history tags default
     smoothly to a neutral 0.5 prior rather than division-by-zero or extreme 0.0/1.0.
- Temporal Splitting:
  1. Instead of random splitting (which evaluates past events using models trained on future data),
     we sort all interaction instances globally by timestamp.
  2. The earliest 80% forms the Training set; the latest 20% forms the Test set.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd

from config import (
    FEATURE_COLUMNS,
    PROCESSED_DATA_DIR,
    RAW_DATA_DIR,
    TARGET_COLUMN,
)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_FeatureBuilder")

SUBMISSIONS_DIR = RAW_DATA_DIR / "submissions"


def load_problem_catalog() -> Dict[str, Dict[str, Any]]:
    """Loads raw problemset and maps 'contestId_index' -> problem metadata."""
    problems_path = RAW_DATA_DIR / "problems.json"
    if not problems_path.exists():
        raise FileNotFoundError(f"Missing {problems_path}. Run fetch_data.py first.")

    with open(problems_path, "r", encoding="utf-8") as f:
        problems_list = json.load(f)

    catalog = {}
    for p in problems_list:
        contest_id = p.get("contestId")
        index = p.get("index")
        if contest_id is not None and index:
            key = f"{contest_id}_{index}"
            catalog[key] = p

    logger.info(f"Loaded {len(catalog)} problems into catalog.")
    return catalog


def load_user_ratings() -> Dict[str, int]:
    """Loads user ratings from sampled_users.json and demo_users.json."""
    ratings = {}
    
    # 1. Sampled users
    sampled_path = RAW_DATA_DIR / "sampled_users.json"
    if sampled_path.exists():
        with open(sampled_path, "r", encoding="utf-8") as f:
            for u in json.load(f):
                ratings[u["handle"]] = u.get("rating", 1200)

    # 2. Demo users
    demo_path = Path(__file__).resolve().parent.parent.parent / "web" / "public" / "data" / "demo_users.json"
    if demo_path.exists():
        with open(demo_path, "r", encoding="utf-8") as f:
            for item in json.load(f):
                prof = item.get("profile", {})
                ratings[prof.get("handle", "")] = prof.get("rating", 1500)

    logger.info(f"Loaded rating mapping for {len(ratings)} users.")
    return ratings


def extract_user_problem_encounters(
    catalog: Dict[str, Dict[str, Any]],
    user_ratings: Dict[str, int]
) -> pd.DataFrame:
    """
    Extracts chronological, leakage-free feature rows for each (user, problem) pair.
    
    For each user:
      1. Group their submissions by problem.
      2. Record t_first (earliest timestamp).
      3. Sort encounters by t_first.
      4. Accumulate historical tag statistics sequentially.
    """
    encounters: List[Dict[str, Any]] = []

    submission_files = list(SUBMISSIONS_DIR.glob("*.json"))
    if not submission_files:
        raise FileNotFoundError(f"No submission files found in {SUBMISSIONS_DIR}")

    logger.info(f"Processing submission histories across {len(submission_files)} users...")

    for sub_file in submission_files:
        handle = sub_file.stem
        user_rating = user_ratings.get(handle, 1400)

        with open(sub_file, "r", encoding="utf-8") as f:
            try:
                submissions = json.load(f)
            except json.JSONDecodeError:
                continue

        if not submissions:
            continue

        # Group submissions by problem
        problem_attempts: Dict[str, List[Dict[str, Any]]] = {}
        for sub in submissions:
            prob = sub.get("problem", {})
            c_id = prob.get("contestId")
            idx = prob.get("index")
            if c_id is None or not idx:
                continue
            key = f"{c_id}_{idx}"
            if key not in problem_attempts:
                problem_attempts[key] = []
            problem_attempts[key].append(sub)

        # For each problem, determine first timestamp and whether user solved it
        user_encounters = []
        for key, subs in problem_attempts.items():
            prob_meta = catalog.get(key)
            if not prob_meta or prob_meta.get("rating") is None:
                continue

            # Earliest submission timestamp on this problem
            t_first = min(s.get("creationTimeSeconds", 0) for s in subs)
            # Did the user get 'OK' on any submission for this problem?
            is_solved = 1 if any(s.get("verdict") == "OK" for s in subs) else 0

            user_encounters.append({
                "problem_key": key,
                "problem_meta": prob_meta,
                "t_first": t_first,
                "is_solved": is_solved,
            })

        # Sort this user's problem encounters chronologically
        user_encounters.sort(key=lambda x: x["t_first"])

        # Sequentially compute past-only features
        past_tag_attempts: Dict[str, int] = {}
        past_tag_solved: Dict[str, int] = {}

        for enc in user_encounters:
            p_meta = enc["problem_meta"]
            p_rating = p_meta.get("rating", 1200)
            p_tags = p_meta.get("tags", [])

            # Compute tag solve rate and attempt count using Laplace Smoothing:
            # solve_rate = (past_solved + 1) / (past_attempts + 2)
            if p_tags:
                tag_rates = []
                total_attempts = 0
                for t in p_tags:
                    att = past_tag_attempts.get(t, 0)
                    sol = past_tag_solved.get(t, 0)
                    tag_rates.append((sol + 1.0) / (att + 2.0))
                    total_attempts += att
                tag_solve_rate = float(np.mean(tag_rates))
                tag_attempts = float(total_attempts)
            else:
                tag_solve_rate = 0.5
                tag_attempts = 0.0

            rating_gap = user_rating - p_rating

            encounters.append({
                "timestamp": enc["t_first"],
                "handle": handle,
                "problem_id": enc["problem_key"],
                "problem_name": p_meta.get("name", ""),
                "tags": ",".join(p_tags),
                "user_rating": user_rating,
                "problem_rating": p_rating,
                "rating_gap": rating_gap,
                "tag_solve_rate": tag_solve_rate,
                "tag_attempts": tag_attempts,
                "solved": enc["is_solved"],
            })

            # Update running tally AFTER recording the current prediction instance (No Leakage!)
            for t in p_tags:
                past_tag_attempts[t] = past_tag_attempts.get(t, 0) + 1
                if enc["is_solved"] == 1:
                    past_tag_solved[t] = past_tag_solved.get(t, 0) + 1

    df = pd.DataFrame(encounters)
    logger.info(f"Extracted {len(df)} total (user, problem) encounters.")
    return df


def split_temporally_and_save(df: pd.DataFrame, train_ratio: float = 0.8) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Sorts all encounters globally by timestamp and performs a temporal split.
    Saves train.csv, test.csv, and feature_summary.json.
    """
    # Global temporal ordering
    df_sorted = df.sort_values(by="timestamp").reset_index(drop=True)

    split_idx = int(len(df_sorted) * train_ratio)
    train_df = df_sorted.iloc[:split_idx].copy()
    test_df = df_sorted.iloc[split_idx:].copy()

    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    train_path = PROCESSED_DATA_DIR / "train.csv"
    test_path = PROCESSED_DATA_DIR / "test.csv"

    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path, index=False)

    logger.info(f"Train set: {len(train_df)} rows ({train_path})")
    logger.info(f"Test set: {len(test_df)} rows ({test_path})")

    # Generate summary report
    summary = {
        "total_instances": len(df_sorted),
        "train_instances": len(train_df),
        "test_instances": len(test_df),
        "train_time_range": {
            "min_timestamp": int(train_df["timestamp"].min()),
            "max_timestamp": int(train_df["timestamp"].max())
        },
        "test_time_range": {
            "min_timestamp": int(test_df["timestamp"].min()),
            "max_timestamp": int(test_df["timestamp"].max())
        },
        "overall_positive_rate": float(df_sorted[TARGET_COLUMN].mean()),
        "train_positive_rate": float(train_df[TARGET_COLUMN].mean()),
        "test_positive_rate": float(test_df[TARGET_COLUMN].mean()),
        "feature_correlations_with_solved": {
            col: float(df_sorted[col].corr(df_sorted[TARGET_COLUMN]))
            for col in FEATURE_COLUMNS
        }
    }

    summary_path = PROCESSED_DATA_DIR / "feature_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info("=" * 60)
    logger.info("FEATURE ENGINEERING SUMMARY")
    logger.info(f"- Total Samples: {len(df_sorted)}")
    logger.info(f"- Train Samples: {len(train_df)} (Solved: {summary['train_positive_rate']:.1%})")
    logger.info(f"- Test Samples: {len(test_df)} (Solved: {summary['test_positive_rate']:.1%})")
    logger.info("Correlations with Target (solved):")
    for feat, corr in summary["feature_correlations_with_solved"].items():
        logger.info(f"  * {feat}: {corr:+.4f}")
    logger.info("=" * 60)

    return train_df, test_df


def main():
    catalog = load_problem_catalog()
    user_ratings = load_user_ratings()
    df = extract_user_problem_encounters(catalog, user_ratings)
    split_temporally_and_save(df)


if __name__ == "__main__":
    main()
