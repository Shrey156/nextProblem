import React, { useState } from 'react';
import { Recommendation } from '../types';
import { Calendar, CheckSquare, Square, ExternalLink, Sparkles } from 'lucide-react';

interface PracticePlanProps {
  recommendations: Recommendation[];
  weakTags: string[];
}

export const PracticePlan: React.FC<PracticePlanProps> = ({ recommendations, weakTags }) => {
  const [completedProblems, setCompletedProblems] = useState<Set<string>>(new Set());

  // Filter recommendations targeting 50-70% zone
  const targetProblems = recommendations.filter((r) => r.isInTargetZone);
  const planPool = targetProblems.length >= 14 ? targetProblems : recommendations;

  // Build 7 days with 2 curated problems each
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayProblems = planPool.slice(i * 2, i * 2 + 2);
    const dayTag = weakTags[i % weakTags.length] || 'general';
    return {
      dayNumber: i + 1,
      themeTag: dayTag,
      problems: dayProblems,
    };
  });

  const toggleProblem = (id: string) => {
    setCompletedProblems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPlanProblems = days.reduce((sum, d) => sum + d.problems.length, 0);
  const completedCount = completedProblems.size;
  const progressPercent = totalPlanProblems > 0 ? Math.round((completedCount / totalPlanProblems) * 100) : 0;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} color="var(--accent-purple)" />
            7-Day Practice Roadmap
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            A curated weekly schedule targeting 2 problems/day in your 50%–70% growth zone, prioritizing your weakest algorithmic tags.
          </p>
        </div>

        {/* Progress tracker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
          <Sparkles size={16} color="var(--accent-purple)" />
          <span style={{ fontSize: '0.85rem' }}>
            Progress: <strong>{completedCount}</strong>/{totalPlanProblems} ({progressPercent}%)
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {days.map((day) => (
          <div
            key={day.dayNumber}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-purple)' }}>
                Day {day.dayNumber}
              </span>
              <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                Focus: {day.themeTag}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {day.problems.map((rec) => {
                const isDone = completedProblems.has(rec.problemId);
                const cfUrl = `https://codeforces.com/problemset/problem/${rec.problem.contestId}/${rec.problem.index}`;
                const probPercent = Math.round(rec.predictedProbability * 100);

                return (
                  <div
                    key={rec.problemId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-secondary)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--border-color)',
                      opacity: isDone ? 0.6 : 1,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => toggleProblem(rec.problemId)}
                        style={{ background: 'none', border: 'none', color: isDone ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                      >
                        {isDone ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rec.problemId}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.3rem' }}>
                          ({probPercent}% • {rec.problem.rating})
                        </span>
                      </div>
                    </div>

                    <a
                      href={cfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center' }}
                      title="Open Problem"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
