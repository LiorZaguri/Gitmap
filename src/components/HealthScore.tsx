import React from 'react';
import type { Commit, Phase } from '../types';
import { calculateHealth } from '../utils/health';

interface HealthScoreProps {
  commits: Commit[];
  phases: Phase[];
}

export const HealthScore: React.FC<HealthScoreProps> = ({ commits, phases }) => {
  const health = calculateHealth(commits, phases);
  
  if (typeof health === 'number') return null;

  const getColor = (score: number) => {
    if (score > 80) return 'var(--green)';
    if (score > 50) return 'var(--amber)';
    return 'var(--red)';
  };

  return (
    <div className="ins-card" style={{ marginTop: '12px' }}>
      <div className="card-title">Project Health Score</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px' }}>
          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="16" fill="none" stroke="var(--bg3)" strokeWidth="3" />
            <circle 
              cx="18" cy="18" r="16" fill="none" 
              stroke={getColor(health.score)} 
              strokeWidth="3" 
              strokeDasharray={`${health.score}, 100`} 
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700 }}>
            {health.score}%
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Activity: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{health.activity}%</span> · {health.velocity} commits/wk
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Stability: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{health.stability}%</span> · {health.stablePhases}/{health.totalPhases} phases healthy
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Freshness: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{health.freshness}%</span> · last commit {health.daysSinceLast}d ago
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Collaboration: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{health.collaboration}%</span> · {health.contributors} contributors
          </div>
        </div>
      </div>
    </div>
  );
};
