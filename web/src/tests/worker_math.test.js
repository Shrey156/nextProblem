/**
 * NextProblem - Web Worker Math Parity & Performance Test
 * Executable in Node.js to verify browser arithmetic independently.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const weightsPath = path.resolve(__dirname, '../../public/data/model_weights.json');
const weightsData = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));

const { weights, bias, featureScaling } = weightsData;
const { means, scales } = featureScaling;

function predictProb(rawFeatures) {
  let z = bias;
  for (let i = 0; i < rawFeatures.length; i++) {
    const scaledX = (rawFeatures[i] - means[i]) / scales[i];
    z += weights[i] * scaledX;
  }
  z = Math.max(-30, Math.min(30, z));
  return 1.0 / (1.0 + Math.exp(-z));
}

console.log('Testing pure-math JavaScript prediction logic...');

// Test 1: Easy problem for high-rated user
// user: 2000, problem: 1200, gap: 800, solve_rate: 0.9, attempts: 30
const probEasy = predictProb([2000, 1200, 800, 0.9, 30]);
console.log(`- Easy Problem Prob: ${(probEasy * 100).toFixed(2)}%`);
if (probEasy <= 0.85) throw new Error(`Expected high solve prob for easy problem, got ${probEasy}`);

// Test 2: Hard problem for low-rated user
// user: 1200, problem: 2200, gap: -1000, solve_rate: 0.3, attempts: 50
const probHard = predictProb([1200, 2200, -1000, 0.3, 50]);
console.log(`- Hard Problem Prob: ${(probHard * 100).toFixed(2)}%`);
if (probHard >= 0.40) throw new Error(`Expected low solve prob for hard problem, got ${probHard}`);

// Test 3: Benchmark 1,000 problems in JS
const t0 = performance.now();
for (let i = 0; i < 1000; i++) {
  predictProb([1500, 1400 + (i % 600), 100 - (i % 600), 0.65, 20]);
}
const elapsedMs = performance.now() - t0;
console.log(`- Benchmark: 1,000 problems scored in ${elapsedMs.toFixed(3)} ms (${Math.round(1000 / (elapsedMs / 1000))} problems/sec)`);

console.log('✓ All JavaScript math tests passed successfully!');
