import React from 'react';
import type { Phase } from '../types';

interface StatsRowProps {
  commitCount: number;
  phases: Phase[];
  totalDays: number;
}

const Stat: React.FC<{ label: string; value: string | number; colorClass?: string }> = ({ label, value, colorClass }) => (
  <div style={{
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '14px',
    textAlign: 'center'
  }}>
    <div className={`stat-n ${colorClass || ''}`}>{value}</div>
    <div className="stat-l">{label}</div>
  </div>
);

export const StatsRow: React.FC<StatsRowProps> = ({ commitCount, phases, totalDays }) => {
  const active = phases.filter(p => p.status === 'active').length;
  const abandoned = phases.filter(p => p.status === 'abandoned').length;
  const velocity = Math.round(commitCount / Math.max(totalDays, 1) * 7);

  return (
    <div className="stats-grid">
      <Stat label="Commits" value={commitCount} />
      <Stat label="Phases" value={phases.length} />
      <Stat label="Active" value={active} colorClass={active > 0 ? 'green' : ''} />
      <Stat label="Abandoned" value={abandoned} colorClass={abandoned > 0 ? 'amber' : 'green'} />
      <Stat label="Commits/wk" value={velocity} />
      <style>{`
        .green { color: var(--green); }
        .amber { color: var(--amber); }
        .red { color: var(--red); }
      `}</style>
    </div>
  );
};
