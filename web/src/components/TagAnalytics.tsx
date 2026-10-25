import React from 'react';
import { TagStat } from '../types';
import { TrendingDown, HelpCircle } from 'lucide-react';

interface TagAnalyticsProps {
  tagStats: TagStat[];
  weakTags: string[];
}

export const TagAnalytics: React.FC<TagAnalyticsProps> = ({ tagStats, weakTags }) => {
  if (tagStats.length === 0) {
    return null;
  }

  const weakTagSet = new Set(weakTags);

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingDown size={20} color="var(--accent-amber)" />
          Algorithmic Strengths & Weaknesses
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <HelpCircle size={14} /> Laplace-smoothed solve rates ((solved + 1) / (attempts + 2))
        </span>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
        The practice engine identifies topics where your solve rate is lowest and prioritizes target problems in these categories.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {tagStats.slice(0, 12).map((item) => {
          const isWeak = weakTagSet.has(item.tag);
          const percent = Math.round(item.solveRate * 100);

          return (
            <div
              key={item.tag}
              style={{
                background: 'var(--bg-primary)',
                border: `1px solid ${isWeak ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)'}`,
                borderRadius: '0.5rem',
                padding: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isWeak ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                  {item.tag}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '0.25rem',
                    background: isWeak ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: isWeak ? 'var(--accent-amber)' : 'var(--accent-green)',
                    fontWeight: 700,
                  }}
                >
                  {isWeak ? 'Weak Focus' : 'Strength'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                <span>Solved: {item.solved} / {item.attempts} attempts</span>
                <strong style={{ color: isWeak ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{percent}%</strong>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: '6px',
                  background: 'var(--bg-card-hover)',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${percent}%`,
                    height: '100%',
                    background: isWeak ? 'var(--accent-amber)' : 'var(--accent-green)',
                    borderRadius: '9999px',
                    transition: 'width 0.4s ease-out',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
