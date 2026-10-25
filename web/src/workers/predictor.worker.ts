/**
 * NextProblem - Prediction & Recommendation Web Worker
 * 
 * Viva Explanation Notes:
 * 1. Why a Web Worker?
 *    Evaluating ML inference and feature aggregations over 1,000+ problems in the main thread
 *    would block the UI and cause frame drops (jank). A Web Worker runs in a separate OS thread,
 *    keeping the React UI responsive at 60 FPS.
 * 2. Pure Math Inference:
 *    z = bias + sum(w_j * (x_j - mean_j) / scale_j)
 *    P(solve) = 1 / (1 + exp(-z))
 *    Runs in microsecond time per problem.
 * 3. Recommendation Target Zone:
 *    Targets problems where 50% <= P(solve) <= 70%, prioritizing the user's weakest tags.
 */

import { CFProblem, CFSubmission, CFUser, ExportedModel, Recommendation, TagStat } from '../types';

export interface WorkerInputPayload {
  user: CFUser;
  submissions: CFSubmission[];
  problems: CFProblem[];
  modelWeights: ExportedModel;
}

export interface WorkerOutputPayload {
  tagStats: TagStat[];
  weakTags: string[];
  recommendations: Recommendation[];
  targetZoneCount: number;
  totalEvaluated: number;
  deviceInferenceTimeMs: number;
}

self.onmessage = (event: MessageEvent<WorkerInputPayload>) => {
  const { user, submissions, problems, modelWeights } = event.data;
  const startTime = performance.now();

  const userRating = user.rating ?? 1200;

  // 1. Compute Historical Tag Performance from Past Submissions
  const solvedProblemKeys = new Set<string>();
  const attemptedProblemKeys = new Set<string>();

  // Aggregate past problems
  const pastTagAttempts: Record<string, number> = {};
  const pastTagSolved: Record<string, number> = {};
  const tagRatingSums: Record<string, number> = {};
  const tagRatingCounts: Record<string, number> = {};

  // Group submissions by unique problem
  const problemSubmissions: Record<string, CFSubmission[]> = {};
  for (const sub of submissions) {
    const p = sub.problem;
    if (p.contestId === undefined || !p.index) continue;
    const key = `${p.contestId}_${p.index}`;
    if (!problemSubmissions[key]) {
      problemSubmissions[key] = [];
    }
    problemSubmissions[key].push(sub);
  }

  for (const [key, subs] of Object.entries(problemSubmissions)) {
    attemptedProblemKeys.add(key);
    const isSolved = subs.some(s => s.verdict === 'OK');
    if (isSolved) {
      solvedProblemKeys.add(key);
    }

    const firstSub = subs[0];
    const tags = firstSub.problem.tags || [];
    const rating = firstSub.problem.rating;

    for (const tag of tags) {
      pastTagAttempts[tag] = (pastTagAttempts[tag] || 0) + 1;
      if (isSolved) {
        pastTagSolved[tag] = (pastTagSolved[tag] || 0) + 1;
        if (rating) {
          tagRatingSums[tag] = (tagRatingSums[tag] || 0) + rating;
          tagRatingCounts[tag] = (tagRatingCounts[tag] || 0) + 1;
        }
      }
    }
  }

  // Build TagStat list with Laplace smoothing
  const tagStats: TagStat[] = [];
  for (const tag of Object.keys(pastTagAttempts)) {
    const attempts = pastTagAttempts[tag] || 0;
    const solved = pastTagSolved[tag] || 0;
    // Laplace smoothing: (solved + 1) / (attempts + 2)
    const solveRate = (solved + 1.0) / (attempts + 2.0);
    const avgRating = tagRatingCounts[tag] ? Math.round(tagRatingSums[tag] / tagRatingCounts[tag]) : userRating;

    tagStats.push({
      tag,
      attempts,
      solved,
      solveRate,
      averageSolvedRating: avgRating
    });
  }

  // Sort tags by solve rate ascending to highlight weaknesses
  tagStats.sort((a, b) => a.solveRate - b.solveRate);
  const weakTags = tagStats.slice(0, 5).map(t => t.tag);

  // 2. Client-Side Inference Over Problemset
  const weights = modelWeights.weights;
  const bias = modelWeights.bias;
  const means = modelWeights.featureScaling?.means || [1909.4, 1386.1, 523.4, 0.77, 24.5];
  const scales = modelWeights.featureScaling?.scales || [675.9, 628.4, 645.0, 0.126, 22.8];

  const recommendations: Recommendation[] = [];
  let targetZoneCount = 0;
  let totalEvaluated = 0;

  for (const prob of problems) {
    if (prob.contestId === undefined || !prob.index || prob.rating === undefined) {
      continue;
    }
    const problemKey = `${prob.contestId}_${prob.index}`;

    // Skip problems the user has already solved
    if (solvedProblemKeys.has(problemKey)) {
      continue;
    }

    totalEvaluated++;

    // Compute problem features
    const problemRating = prob.rating;
    const ratingGap = userRating - problemRating;

    let tagSolveRate = 0.5;
    let tagAttempts = 0;

    if (prob.tags && prob.tags.length > 0) {
      let sumRate = 0;
      let totalAtt = 0;
      for (const t of prob.tags) {
        const att = pastTagAttempts[t] || 0;
        const sol = pastTagSolved[t] || 0;
        sumRate += (sol + 1.0) / (att + 2.0);
        totalAtt += att;
      }
      tagSolveRate = sumRate / prob.tags.length;
      tagAttempts = totalAtt;
    }

    // Standardize features
    const rawFeatures = [userRating, problemRating, ratingGap, tagSolveRate, tagAttempts];
    let z = bias;
    for (let i = 0; i < rawFeatures.length; i++) {
      const scaledX = (rawFeatures[i] - means[i]) / scales[i];
      z += weights[i] * scaledX;
    }

    // Clip z to avoid numerical overflow in Math.exp(-z)
    z = Math.max(-30, Math.min(30, z));
    const probability = 1.0 / (1.0 + Math.exp(-z));

    const isInTargetZone = probability >= 0.50 && probability <= 0.70;
    if (isInTargetZone) {
      targetZoneCount++;
    }

    let difficultyLabel: 'Easy' | 'Target' | 'Challenging' | 'Hard' = 'Target';
    if (probability >= 0.70) difficultyLabel = 'Easy';
    else if (probability >= 0.50) difficultyLabel = 'Target';
    else if (probability >= 0.30) difficultyLabel = 'Challenging';
    else difficultyLabel = 'Hard';

    // Primary tag representation
    const primaryTag = prob.tags && prob.tags.length > 0 ? prob.tags[0] : 'general';

    recommendations.push({
      problem: prob,
      problemId: `${prob.contestId}${prob.index}`,
      predictedProbability: probability,
      targetTag: primaryTag,
      isInTargetZone,
      difficultyLabel
    });
  }

  // 3. Sort Recommendations
  // Priority rule:
  // 1. Problems in Target Zone (50%-70%) matching user's weak tags
  // 2. Other Target Zone problems closest to optimal 60% probability
  // 3. Remaining problems by distance to 60%
  const weakTagSet = new Set(weakTags);
  recommendations.sort((a, b) => {
    const aWeak = a.problem.tags.some(t => weakTagSet.has(t));
    const bWeak = b.problem.tags.some(t => weakTagSet.has(t));

    if (a.isInTargetZone && !b.isInTargetZone) return -1;
    if (!a.isInTargetZone && b.isInTargetZone) return 1;

    if (aWeak && !bWeak) return -1;
    if (!aWeak && bWeak) return 1;

    // Closest to optimal 60% solve probability
    return Math.abs(a.predictedProbability - 0.60) - Math.abs(b.predictedProbability - 0.60);
  });

  const endTime = performance.now();
  const deviceInferenceTimeMs = Math.round((endTime - startTime) * 100) / 100;

  const output: WorkerOutputPayload = {
    tagStats,
    weakTags,
    recommendations: recommendations.slice(0, 100), // Top 100 optimal practice items
    targetZoneCount,
    totalEvaluated,
    deviceInferenceTimeMs
  };

  self.postMessage(output);
};
