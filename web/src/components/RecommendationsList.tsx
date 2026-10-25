import React, { useState } from 'react';
import { Recommendation } from '../types';
import { ExternalLink, Target } from 'lucide-react';

interface RecommendationsListProps {
  recommendations: Recommendation[];
  targetZoneCount: number;
  totalEvaluated: number;
}

export const RecommendationsList: React.FC<RecommendationsListProps> = ({
  recommendations,
  targetZoneCount,
  totalEvaluated,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'target' | 'challenging'>('target');

  const filtered = recommendations.filter((r) => {
    if (filterMode === 'target') return r.isInTargetZone;
    if (filterMode === 'challenging') return r.difficultyLabel === 'Challenging' || r.difficultyLabel === 'Hard';
    return true;
  });

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={22} color="var(--accent-blue)" />
            Recommended Practice Problems
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Identified <strong style={{ color: 'var(--accent-green)' }}>{targetZoneCount}</strong> optimal problems in your 50%–70% growth zone from {totalEvaluated} scored problems.
          </p>
        </div>

        {/* Filter controls */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setFilterMode('target')}
            style={{
              background: filterMode === 'target' ? 'var(--accent-blue)' : 'transparent',
              color: filterMode === 'target' ? '#0f172a' : 'var(--text-secondary)',
              border: 'none',
              padding: '0.35rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            Target Zone (50%–70%)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            style={{
              background: filterMode === 'all' ? 'var(--accent-blue)' : 'transparent',
              color: filterMode === 'all' ? '#0f172a' : 'var(--text-secondary)',
              border: 'none',
              padding: '0.35rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            All Recommended ({recommendations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('challenging')}
            style={{
              background: filterMode === 'challenging' ? 'var(--accent-blue)' : 'transparent',
              color: filterMode === 'challenging' ? '#0f172a' : 'var(--text-secondary)',
              border: 'none',
              padding: '0.35rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            Challenging (&lt;50%)
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No problems found matching this filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {filtered.slice(0, 30).map((item) => {
            const prob = item.problem;
            const cfUrl = `https://codeforces.com/problemset/problem/${prob.contestId}/${prob.index}`;
            const probPercent = Math.round(item.predictedProbability * 100);

            let badgeColor = 'var(--accent-blue)';
            let badgeBg = 'rgba(56, 189, 248, 0.15)';
            if (item.isInTargetZone) {
              badgeColor = 'var(--accent-green)';
              badgeBg = 'rgba(34, 197, 94, 0.15)';
            } else if (item.difficultyLabel === 'Challenging' || item.difficultyLabel === 'Hard') {
              badgeColor = 'var(--accent-red)';
              badgeBg = 'rgba(239, 68, 68, 0.15)';
            }

            return (
              <div
                key={item.problemId}
                style={{
                  background: 'var(--bg-primary)',
                  border: `1px solid ${item.isInTargetZone ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-color)'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: item.isInTargetZone ? '0 0 10px rgba(34, 197, 94, 0.1)' : 'none',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                      <span style={{ color: 'var(--accent-blue)', marginRight: '0.4rem' }}>{item.problemId}:</span>
                      {prob.name}
                    </h3>
                    <a
                      href={cfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open on Codeforces"
                      style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-blue)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: badgeBg,
                        color: badgeColor,
                      }}
                    >
                      {probPercent}% Predicted Solve
                    </span>

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Rating: <strong>{prob.rating}</strong>
                    </span>

                    {item.isInTargetZone && (
                      <span className="badge badge-target" style={{ fontSize: '0.65rem' }}>
                        Growth Zone
                      </span>
                    )}
                  </div>

                  {/* Problem Tags */}
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                    {prob.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '0.25rem',
                          background: 'var(--bg-card-hover)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '0.85rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Target Tag: <strong style={{ color: 'var(--text-primary)' }}>{item.targetTag}</strong></span>
                  <a
                    href={cfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent-blue)' }}
                  >
                    Solve on Codeforces →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
