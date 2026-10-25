"""
NextProblem - ML Configuration & Constants
Viva Note:
All constants (paths, rate limits, feature definitions, and target probabilities)
are centralized here to avoid hardcoded magic numbers across the pipeline.
"""

from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
MODELS_DIR = BASE_DIR / "models"
WEB_EXPORT_DIR = BASE_DIR.parent / "web" / "public" / "data"

# Codeforces API configuration
# Codeforces documentation states: "Please do not make more than 1 request per 2 seconds"
CF_API_BASE_URL = "https://codeforces.com/api"
CF_RATE_LIMIT_DELAY_SECONDS = 2.0

# Target probability practice window
TARGET_PROBABILITY_MIN = 0.50
TARGET_PROBABILITY_MAX = 0.70

# Feature definitions
FEATURE_COLUMNS = [
    "user_rating",
    "problem_rating",
    "rating_gap",       # user_rating - problem_rating
    "tag_solve_rate",   # User's historical solve rate on these tags prior to submission
    "tag_attempts",     # User's historical attempt count on these tags prior to submission
]

TARGET_COLUMN = "solved"
