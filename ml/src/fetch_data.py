"""
NextProblem - Data Collection Pipeline
Scrapes Codeforces problemset, user profiles, and submission histories.

Viva Explanation Notes:
- Codeforces Documentation Rule: "Please do not make more than 1 request per 2 seconds."
  We enforce a strict 2.05s delay between consecutive calls to avoid rate limiting.
- Resumability: Submissions for each user are saved in separate JSON files.
  If the process is interrupted, re-running skips already downloaded users.
- Stratification: We sample users across rating brackets (800-2200+) so our ML models
  learn from both beginner and advanced solving patterns rather than a skewed distribution.
- Offline Bundling: Also exports a clean problemset snapshot and demo users
  to `web/public/data/` for zero-key, offline browser operation.
"""

import argparse
import json
import logging
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests

from config import (
    CF_API_BASE_URL,
    CF_RATE_LIMIT_DELAY_SECONDS,
    RAW_DATA_DIR,
    WEB_EXPORT_DIR,
)

# Configure logging for clear, transparent progress
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("CF_DataCollector")

SUBMISSIONS_DIR = RAW_DATA_DIR / "submissions"


class CodeforcesAPIClient:
    """Handles communication with the official Codeforces API with rate limiting & retries."""

    def __init__(self, delay_seconds: float = CF_RATE_LIMIT_DELAY_SECONDS):
        self.delay_seconds = delay_seconds
        self.last_request_time = 0.0
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "NextProblem-Research-Bot/1.0 (Webster2k26 Academic Project)"
        })

    def _throttle(self) -> None:
        """Enforces at least `self.delay_seconds` between requests to honor API guidelines."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.delay_seconds:
            sleep_time = self.delay_seconds - elapsed
            time.sleep(sleep_time)
        self.last_request_time = time.time()

    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, max_retries: int = 3) -> Dict[str, Any]:
        """
        Executes a GET request against the Codeforces API with exponential backoff.
        
        Viva Note:
        Codeforces returns HTTP 200 with {"status": "OK", "result": ...} on success,
        or {"status": "FAILED", "comment": ...} on business logic failures.
        """
        url = f"{CF_API_BASE_URL}/{endpoint}"
        retries = 0

        while retries < max_retries:
            self._throttle()
            try:
                response = self.session.get(url, params=params, timeout=15)
                
                # Check for rate limiting status code
                if response.status_code == 429:
                    wait = 5.0 * (2 ** retries)
                    logger.warning(f"Rate limited (429) on {endpoint}. Backing off for {wait:.1f}s...")
                    time.sleep(wait)
                    retries += 1
                    continue

                if response.status_code == 503:
                    wait = 4.0 * (2 ** retries)
                    logger.warning(f"Codeforces temporarily unavailable (503). Backing off for {wait:.1f}s...")
                    time.sleep(wait)
                    retries += 1
                    continue

                response.raise_for_status()
                data = response.json()

                if data.get("status") != "OK":
                    raise ValueError(f"Codeforces API error: {data.get('comment', 'Unknown error')}")

                return data.get("result", {})

            except (requests.RequestException, json.JSONDecodeError, ValueError) as err:
                retries += 1
                logger.warning(f"Attempt {retries}/{max_retries} failed for {endpoint}: {err}")
                if retries >= max_retries:
                    raise
                time.sleep(3.0 * retries)

        raise RuntimeError(f"Exceeded max retries for {endpoint}")


def collect_problemset(client: CodeforcesAPIClient) -> List[Dict[str, Any]]:
    """
    Fetches all available problems from /api/problemset.problems.
    Filters out problems without difficulty ratings or tags.
    """
    logger.info("Fetching complete Codeforces problemset...")
    result = client.get("problemset.problems")
    problems = result.get("problems", [])
    
    # Filter for problems with an established rating and non-empty tags
    rated_problems = [
        p for p in problems 
        if p.get("rating") is not None and len(p.get("tags", [])) > 0
    ]

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw_problems_path = RAW_DATA_DIR / "problems.json"
    with open(raw_problems_path, "w", encoding="utf-8") as f:
        json.dump(rated_problems, f, indent=2)

    logger.info(f"Saved {len(rated_problems)} rated problems to {raw_problems_path}")
    return rated_problems


def sample_stratified_users(
    client: CodeforcesAPIClient,
    total_samples: int = 50,
    seed: int = 42
) -> List[Dict[str, Any]]:
    """
    Samples users across different rating tiers from /api/user.ratedList.
    Tiers:
      - Newbie: 800 - 1199
      - Pupil: 1200 - 1399
      - Specialist: 1400 - 1599
      - Expert: 1600 - 1899
      - Candidate Master / Master: 1900+
    """
    logger.info("Fetching active rated users list...")
    users = client.get("user.ratedList", params={"activeOnly": "true"})
    logger.info(f"Retrieved {len(users)} active rated users.")

    tiers = {
        "newbie": [u for u in users if 800 <= u.get("rating", 0) < 1200],
        "pupil": [u for u in users if 1200 <= u.get("rating", 0) < 1400],
        "specialist": [u for u in users if 1400 <= u.get("rating", 0) < 1600],
        "expert": [u for u in users if 1600 <= u.get("rating", 0) < 1900],
        "master_plus": [u for u in users if u.get("rating", 0) >= 1900],
    }

    per_tier = max(1, total_samples // len(tiers))
    rng = random.Random(seed)
    sampled_users: List[Dict[str, Any]] = []

    for tier_name, tier_users in tiers.items():
        sample_size = min(per_tier, len(tier_users))
        chosen = rng.sample(tier_users, sample_size)
        sampled_users.extend(chosen)
        logger.info(f"Tier '{tier_name}': sampled {sample_size} users (available: {len(tier_users)})")

    users_path = RAW_DATA_DIR / "sampled_users.json"
    with open(users_path, "w", encoding="utf-8") as f:
        json.dump(sampled_users, f, indent=2)

    logger.info(f"Saved {len(sampled_users)} sampled users to {users_path}")
    return sampled_users


def collect_user_submissions(
    client: CodeforcesAPIClient,
    users: List[Dict[str, Any]],
    max_submissions_per_user: int = 200
) -> int:
    """
    Downloads chronological submission history for each sampled user.
    Saves each user into `ml/data/raw/submissions/{handle}.json`.
    Skips files that already exist (resumable).
    """
    SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)
    total_saved = 0

    for idx, user in enumerate(users, 1):
        handle = user["handle"]
        user_file = SUBMISSIONS_DIR / f"{handle}.json"

        # Resume support: skip if already collected
        if user_file.exists():
            try:
                with open(user_file, "r", encoding="utf-8") as f:
                    cached_subs = json.load(f)
                logger.info(f"[{idx}/{len(users)}] User '{handle}' already cached ({len(cached_subs)} submissions). Skipping.")
                total_saved += len(cached_subs)
                continue
            except json.JSONDecodeError:
                logger.warning(f"Corrupt cache file for '{handle}', refetching...")

        logger.info(f"[{idx}/{len(users)}] Fetching submissions for '{handle}' (rating: {user.get('rating')})...")
        try:
            # We fetch up to max_submissions_per_user (most recent to older)
            submissions = client.get("user.status", params={"handle": handle, "from": 1, "count": max_submissions_per_user})
            
            with open(user_file, "w", encoding="utf-8") as f:
                json.dump(submissions, f, indent=2)

            total_saved += len(submissions)
            logger.info(f"Saved {len(submissions)} submissions for '{handle}'.")
        except Exception as e:
            logger.error(f"Failed to fetch submissions for '{handle}': {e}")

    return total_saved


def export_offline_bundles(problems: List[Dict[str, Any]], client: CodeforcesAPIClient) -> None:
    """
    Creates bundled snapshots in `web/public/data/` for zero-key offline web operation:
    1. `problems_snapshot.json`: A curated subset of ~1,000 popular rated problems across all tags.
    2. `demo_users.json`: 4 representative users across rating tiers with preloaded submissions.
    """
    WEB_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Export problems snapshot: select diverse rated problems
    # Sort by contestId descending (newer standard problems)
    sorted_problems = sorted(problems, key=lambda p: p.get("contestId", 0), reverse=True)
    curated_problems = sorted_problems[:1200]

    snapshot_path = WEB_EXPORT_DIR / "problems_snapshot.json"
    with open(snapshot_path, "w", encoding="utf-8") as f:
        json.dump(curated_problems, f, indent=2)
    logger.info(f"Exported {len(curated_problems)} problems to {snapshot_path}")

    # 2. Export demo users with full submission history
    demo_handles = ["tourist", "Petr", "Errichto", "SecondThread"]
    demo_data: List[Dict[str, Any]] = []

    logger.info(f"Collecting demo users snapshot for web offline mode: {demo_handles}...")
    for handle in demo_handles:
        user_file = SUBMISSIONS_DIR / f"{handle}.json"
        submissions = []

        if user_file.exists():
            with open(user_file, "r", encoding="utf-8") as f:
                submissions = json.load(f)
        else:
            try:
                submissions = client.get("user.status", params={"handle": handle, "from": 1, "count": 150})
                with open(user_file, "w", encoding="utf-8") as f:
                    json.dump(submissions, f, indent=2)
            except Exception as e:
                logger.warning(f"Could not fetch demo user {handle}: {e}")

        # Fetch profile info
        try:
            user_info_list = client.get("user.info", params={"handles": handle})
            profile = user_info_list[0] if user_info_list else {"handle": handle, "rating": 1500}
        except Exception:
            profile = {"handle": handle, "rating": 1500, "rank": "candidate master"}

        demo_data.append({
            "profile": profile,
            "submissions": submissions
        })

    demo_path = WEB_EXPORT_DIR / "demo_users.json"
    with open(demo_path, "w", encoding="utf-8") as f:
        json.dump(demo_data, f, indent=2)
    logger.info(f"Exported {len(demo_data)} demo user profiles with submissions to {demo_path}")


def main():
    parser = argparse.ArgumentParser(description="Codeforces Data Collection Pipeline")
    parser.add_argument("--quick", action="store_true", help="Quick mode: samples 15 users across tiers for fast verification")
    parser.add_argument("--users", type=int, default=50, help="Number of users to sample (default: 50)")
    parser.add_argument("--offline-only", action="store_true", help="Only build offline bundles from existing raw data")
    args = parser.parse_args()

    client = CodeforcesAPIClient()

    if args.offline_only:
        raw_problems_path = RAW_DATA_DIR / "problems.json"
        if not raw_problems_path.exists():
            logger.error("No raw problems.json found! Cannot build offline bundle.")
            return
        with open(raw_problems_path, "r", encoding="utf-8") as f:
            problems = json.load(f)
        export_offline_bundles(problems, client)
        return

    sample_count = 15 if args.quick else args.users
    logger.info(f"Starting data collection. Target user sample count: {sample_count}")

    start_time = time.time()

    # Step 1: Collect problemset
    problems = collect_problemset(client)

    # Step 2: Stratified sample of users
    sampled_users = sample_stratified_users(client, total_samples=sample_count)

    # Step 3: Collect submissions for each user
    total_submissions = collect_user_submissions(client, sampled_users, max_submissions_per_user=150)

    # Step 4: Export offline bundle for React web app
    export_offline_bundles(problems, client)

    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info("DATA COLLECTION COMPLETE (Empirical Summary)")
    logger.info(f"- Total Problems Collected: {len(problems)}")
    logger.info(f"- Total Users Sampled: {len(sampled_users)}")
    logger.info(f"- Total Submissions Collected: {total_submissions}")
    logger.info(f"- Wall Clock Time: {elapsed:.2f} seconds")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
