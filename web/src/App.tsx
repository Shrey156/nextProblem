import React, { useState, useEffect, useCallback } from 'react';
import { Target, Cpu, Activity, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { CFProblem, CFSubmission, CFUser, ExportedModel, Recommendation, TagStat, TelemetryData } from './types';
import { CodeforcesService } from './services/codeforcesApi';
import { PredictionService } from './services/predictionService';
import { OfflineStorage } from './services/storage';
import { UserSearch } from './components/UserSearch';
import { TagAnalytics } from './components/TagAnalytics';
import { RecommendationsList } from './components/RecommendationsList';
import { PracticePlan } from './components/PracticePlan';
import { ModelEvaluationView } from './components/ModelEvaluationView';
import { TelemetryPanel } from './components/TelemetryPanel';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'recommend' | 'model' | 'telemetry'>('recommend');
  const [modelWeights, setModelWeights] = useState<ExportedModel | null>(null);
  const [problemset, setProblemset] = useState<CFProblem[]>([]);
  const [currentUser, setCurrentUser] = useState<CFUser | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recommendations state
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [weakTags, setWeakTags] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [targetZoneCount, setTargetZoneCount] = useState<number>(0);
  const [totalEvaluated, setTotalEvaluated] = useState<number>(0);

  // Telemetry state
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [cacheStats, setCacheStats] = useState<{ hits: number; misses: number; hitRatio: number }>({ hits: 0, misses: 0, hitRatio: 0 });
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // 1. Initial Bootstrap: Load model weights, problemset snapshot, register Service Worker
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [weights, problems, initialCacheStats] = await Promise.all([
          CodeforcesService.getModelWeights(),
          CodeforcesService.getProblemset(),
          OfflineStorage.getCacheStats(),
        ]);

        setModelWeights(weights);
        setProblemset(problems);
        setCacheStats(initialCacheStats);

        // Register Service Worker for offline capability
        if ('serviceWorker' in navigator && !import.meta.env.DEV) {
          navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('Service worker registration failed:', err);
          });
        }

        // Auto-load default demo user for instant first impression
        handleUserSearch('tourist', weights, problems);
      } catch (err) {
        console.error('Bootstrap error:', err);
      }
    };

    bootstrap();

    // Listen to network status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. User Analysis & Prediction Handler
  const handleUserSearch = useCallback(
    async (handle: string, weightsOverride?: ExportedModel, problemsOverride?: CFProblem[]) => {
      const activeWeights = weightsOverride || modelWeights;
      const activeProblems = problemsOverride || problemset;

      if (!activeWeights || activeProblems.length === 0) {
        setErrorMessage('Model weights or problem dataset still loading. Please try again.');
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const cleanHandle = handle.trim();
        const cacheKeyProfile = `user_profile_${cleanHandle.toLowerCase()}`;
        const cacheKeySubs = `user_subs_${cleanHandle.toLowerCase()}`;

        // Check IndexedDB cache first
        const cachedProfile = await OfflineStorage.get<CFUser>(cacheKeyProfile);
        const cachedSubs = await OfflineStorage.get<CFSubmission[]>(cacheKeySubs);

        let user: CFUser;
        let submissions: CFSubmission[];
        let usedFallback = false;
        let wasCacheHit = false;

        if (cachedProfile && cachedSubs) {
          user = cachedProfile;
          submissions = cachedSubs;
          wasCacheHit = true;
          const updatedStats = await OfflineStorage.recordCacheHit(true);
          setCacheStats(updatedStats);
        } else {
          // Fetch from API with fallback
          const [userRes, subsRes] = await Promise.all([
            CodeforcesService.getUserInfo(cleanHandle),
            CodeforcesService.getUserSubmissions(cleanHandle),
          ]);

          user = userRes.user;
          submissions = subsRes.submissions;
          usedFallback = userRes.isFallback || subsRes.isFallback;

          // Cache in IndexedDB for subsequent visits
          await OfflineStorage.set(cacheKeyProfile, user);
          await OfflineStorage.set(cacheKeySubs, submissions);

          const updatedStats = await OfflineStorage.recordCacheHit(false);
          setCacheStats(updatedStats);
        }

        setCurrentUser(user);
        setIsFallback(usedFallback);

        // Run client-side inference inside Web Worker
        const workerResult = await PredictionService.runInference(user, submissions, activeProblems, activeWeights);

        setTagStats(workerResult.tagStats);
        setWeakTags(workerResult.weakTags);
        setRecommendations(workerResult.recommendations);
        setTargetZoneCount(workerResult.targetZoneCount);
        setTotalEvaluated(workerResult.totalEvaluated);

        // Record real device telemetry
        setTelemetry({
          deviceInferenceTimeMs: workerResult.deviceInferenceTimeMs,
          problemsScoredCount: workerResult.totalEvaluated,
          modelSizeBytes: 1287,
          cacheHit: wasCacheHit,
          dataSource: wasCacheHit ? 'indexed_db' : usedFallback ? 'bundled_snapshot' : 'live_api',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
      }
    },
    [modelWeights, problemset]
  );

  // 3. Interactive Web Worker Benchmark
  const handleRunBenchmark = async () => {
    if (!currentUser || !modelWeights || problemset.length === 0) return;
    setIsBenchmarking(true);

    try {
      const dummySubs: CFSubmission[] = [];
      const result = await PredictionService.runInference(currentUser, dummySubs, problemset, modelWeights);

      setTelemetry((prev) => ({
        deviceInferenceTimeMs: result.deviceInferenceTimeMs,
        problemsScoredCount: result.totalEvaluated,
        modelSizeBytes: 1287,
        cacheHit: prev?.cacheHit ?? false,
        dataSource: prev?.dataSource ?? 'bundled_snapshot',
      }));
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.8rem', color: 'var(--text-primary)' }}>
              <Target color="var(--accent-blue)" size={28} />
              NextProblem
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Codeforces Practice Recommendation Engine • Target Solve Probability 50%–70% • Webster 2026
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <span
              className="badge"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: isOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isOnline ? 'var(--accent-green)' : 'var(--accent-red)',
                border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              }}
            >
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? 'Online' : 'Offline Mode'}
            </span>

            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={12} /> Zero-Key Local ML
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav style={{ display: 'flex', gap: '0.75rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('recommend')}
            style={{
              background: activeTab === 'recommend' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: activeTab === 'recommend' ? '#0f172a' : 'var(--text-primary)',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
            }}
          >
            <Target size={16} /> Recommendations & Practice Plan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('model')}
            style={{
              background: activeTab === 'model' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: activeTab === 'model' ? '#0f172a' : 'var(--text-primary)',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
            }}
          >
            <Cpu size={16} /> Model Evaluation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('telemetry')}
            style={{
              background: activeTab === 'telemetry' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: activeTab === 'telemetry' ? '#0f172a' : 'var(--text-primary)',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
            }}
          >
            <Activity size={16} /> Device Telemetry
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main>
        {activeTab === 'recommend' && (
          <div>
            <UserSearch
              onSearch={(handle) => handleUserSearch(handle)}
              isLoading={isLoading}
              currentUser={currentUser}
              isFallback={isFallback}
              errorMessage={errorMessage}
            />

            {currentUser && (
              <>
                <TagAnalytics tagStats={tagStats} weakTags={weakTags} />
                <PracticePlan recommendations={recommendations} weakTags={weakTags} />
                <RecommendationsList
                  recommendations={recommendations}
                  targetZoneCount={targetZoneCount}
                  totalEvaluated={totalEvaluated}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'model' && <ModelEvaluationView modelWeights={modelWeights} />}

        {activeTab === 'telemetry' && (
          <TelemetryPanel
            telemetry={telemetry}
            cacheStats={cacheStats}
            onRunBenchmark={handleRunBenchmark}
            isBenchmarking={isBenchmarking}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: '3rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        NextProblem • Built for CodeSangam Webster 2026 • 100% Client-Side Machine Learning • Zero External Paid APIs
      </footer>
    </div>
  );
};

export default App;
