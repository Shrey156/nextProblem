/**
 * NextProblem - Codeforces API Client & Offline Fallback Service
 * 
 * Viva Explanation Notes:
 * - CORS Support: Codeforces natively returns 'Access-Control-Allow-Origin: *'.
 * - Offline Fallback: If network is offline or Codeforces is rate-limited (HTTP 429),
 *   this service gracefully falls back to the bundled offline snapshot in `/data/`.
 * - Failure Modes Handled:
 *   1. Invalid handle -> specific user error toast.
 *   2. Unrated user -> default rating 1200 with notice.
 *   3. Network drop -> seamless fallback to demo data / IndexedDB.
 */

import { CFProblem, CFSubmission, CFUser, ExportedModel } from '../types';

const CF_API_BASE = 'https://codeforces.com/api';

export class CodeforcesService {
  /**
   * Fetches user profile info.
   * Falls back to bundled demo users if network fails or handle matches demo user.
   */
  static async getUserInfo(handle: string): Promise<{ user: CFUser; isFallback: boolean }> {
    const cleanHandle = handle.trim();
    if (!cleanHandle) {
      throw new Error('Please enter a valid Codeforces handle.');
    }

    // Try live API first
    try {
      const response = await fetch(`${CF_API_BASE}/user.info?handles=${encodeURIComponent(cleanHandle)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.result && data.result.length > 0) {
          const raw = data.result[0];
          return {
            user: {
              handle: raw.handle,
              rating: raw.rating ?? 1200, // Handle unrated users with default 1200
              maxRating: raw.maxRating ?? 1200,
              rank: raw.rank ?? 'unrated',
              maxRank: raw.maxRank ?? 'unrated',
              avatar: raw.avatar,
              titlePhoto: raw.titlePhoto,
            },
            isFallback: false
          };
        } else if (data.comment && data.comment.includes('not found')) {
          throw new Error(`Handle '${cleanHandle}' not found on Codeforces.`);
        }
      }
    } catch (err: unknown) {
      // If handle was explicitly not found, don't fallback to demo user
      if (err instanceof Error && err.message.includes('not found')) {
        throw err;
      }
      console.warn('Codeforces API request failed. Checking bundled demo data...', err);
    }

    // Fallback: check bundled demo_users.json
    try {
      const basePath = import.meta.env.BASE_URL || './';
      const fallbackResp = await fetch(`${basePath}data/demo_users.json`);
      if (fallbackResp.ok) {
        const demoUsers = await fallbackResp.json();
        const match = demoUsers.find((d: { profile: CFUser }) => 
          d.profile.handle.toLowerCase() === cleanHandle.toLowerCase()
        );
        if (match) {
          return { user: match.profile, isFallback: true };
        }
        // If handle is not one of demo users, pick the first demo user as simulated profile
        if (demoUsers.length > 0) {
          const defaultDemo = demoUsers[0].profile;
          return {
            user: { ...defaultDemo, handle: `${cleanHandle} (Demo Fallback: ${defaultDemo.handle})` },
            isFallback: true
          };
        }
      }
    } catch (fallbackErr) {
      console.error('Failed to load demo users bundle:', fallbackErr);
    }

    throw new Error(`Unable to fetch user '${cleanHandle}'. Check internet connection or Codeforces status.`);
  }

  /**
   * Fetches user's submission history.
   * Falls back to bundled demo data when offline.
   */
  static async getUserSubmissions(handle: string): Promise<{ submissions: CFSubmission[]; isFallback: boolean }> {
    const cleanHandle = handle.trim();

    try {
      const response = await fetch(`${CF_API_BASE}/user.status?handle=${encodeURIComponent(cleanHandle)}&from=1&count=200`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK') {
          return { submissions: data.result, isFallback: false };
        }
      }
    } catch (err) {
      console.warn('API error fetching submissions. Using bundled fallback...', err);
    }

    // Fallback to demo users
    try {
      const basePath = import.meta.env.BASE_URL || './';
      const fallbackResp = await fetch(`${basePath}data/demo_users.json`);
      if (fallbackResp.ok) {
        const demoUsers = await fallbackResp.json();
        const match = demoUsers.find((d: { profile: CFUser; submissions: CFSubmission[] }) => 
          d.profile.handle.toLowerCase() === cleanHandle.toLowerCase()
        );
        if (match) {
          return { submissions: match.submissions, isFallback: true };
        }
        if (demoUsers.length > 0) {
          return { submissions: demoUsers[0].submissions, isFallback: true };
        }
      }
    } catch (e) {
      console.error('Failed to load demo submissions:', e);
    }

    return { submissions: [], isFallback: true };
  }

  /**
   * Loads the problemset snapshot bundled in the web app.
   */
  static async getProblemset(): Promise<CFProblem[]> {
    try {
      const basePath = import.meta.env.BASE_URL || './';
      const resp = await fetch(`${basePath}data/problems_snapshot.json`);
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.error('Failed to load bundled problemset snapshot:', e);
    }
    return [];
  }

  /**
   * Loads the exported model weights and calibration metrics.
   */
  static async getModelWeights(): Promise<ExportedModel> {
    const basePath = import.meta.env.BASE_URL || './';
    const resp = await fetch(`${basePath}data/model_weights.json`);
    if (!resp.ok) {
      throw new Error('Failed to load model weights JSON artifact.');
    }
    return await resp.json();
  }
}
