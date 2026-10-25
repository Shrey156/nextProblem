/**
 * NextProblem - Domain Models & Type Definitions
 * 
 * Second-year CS Viva Note:
 * Defining TypeScript interfaces explicitly establishes a strict data contract
 * between the Codeforces API, our feature engineering pipeline, the Web Worker,
 * and the React UI.
 */

// Represents a Codeforces problem from /api/problemset.problems
export interface CFProblem {
  contestId?: number;
  index: string;
  name: string;
  type: string;
  points?: number;
  rating?: number;
  tags: string[];
}

// Represents a Codeforces submission from /api/user.status
export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds?: number;
  problem: CFProblem;
  author: {
    contestId?: number;
    members: { handle: string }[];
    participantType: string;
    ghost: boolean;
    startTimeSeconds?: number;
  };
  programmingLanguage: string;
  verdict?: 'OK' | 'WRONG_ANSWER' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED' | 'COMPILATION_ERROR' | string;
  testset: string;
  passedTestCount: number;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
}

// Represents user info from /api/user.info
export interface CFUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  avatar?: string;
  titlePhoto?: string;
}

// Tag performance analytics computed for the user
export interface TagStat {
  tag: string;
  attempts: number;
  solved: number;
  solveRate: number; // 0.0 to 1.0
  averageSolvedRating: number;
}

// Features computed for a (user, problem) pair at a specific prediction moment
export interface ModelFeatures {
  userRating: number;
  problemRating: number;
  ratingGap: number;           // userRating - problemRating
  tagSolveRate: number;        // User's historical solve rate on problem's primary tags
  tagAttempts: number;         // Total past attempts on these tags
}

// Model coefficients exported from Python scikit-learn
export interface ExportedModel {
  modelType: 'logistic_regression';
  version: string;
  trainedAt: string;
  featureNames: string[];
  weights: number[];           // Coefficients w_1 ... w_n
  bias: number;                // Intercept w_0
  featureScaling?: {
    means: number[];
    scales: number[];
  };
  metrics: {
    auc: number;
    logLoss: number;
    brierScore: number;
  };
  baselineMetrics: {
    gapBaselineAuc: number;
    gapBaselineLogLoss: number;
    eloLogisticAuc: number;
    eloLogisticLogLoss: number;
  };
}

// Recommended problem with predicted probability
export interface Recommendation {
  problem: CFProblem;
  problemId: string;           // e.g. "1800C"
  predictedProbability: number;// 0.0 to 1.0
  targetTag: string;
  isInTargetZone: boolean;     // True if 50% <= probability <= 70%
  difficultyLabel: 'Easy' | 'Target' | 'Challenging' | 'Hard';
}

// Telemetry benchmark numbers actually measured on user's device
export interface TelemetryData {
  deviceInferenceTimeMs: number; // Time taken to score 1000 problems
  problemsScoredCount: number;
  modelSizeBytes: number;
  cacheHit: boolean;
  dataSource: 'live_api' | 'indexed_db' | 'bundled_snapshot';
}
