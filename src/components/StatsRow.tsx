import React from 'react';
import type { Phase } from '../types';

interface StatsRowProps {
  commitCount: number;
  phases: Phase[];
  totalDays: number;
}

export const StatsRow: React.FC<StatsRowProps> = ({ commitCount, phases, totalDays }) => {
  const active = phases.filter(p => p.status === 'active').length;
  const abandoned = phases.filter(p => p.status === 'abandoned').length;
  const velocity = Math.round(commitCount / Math.max(totalDays, 1) * 7);

  const Stat: React.FC<{ label: string; value: string | number; colorClass?: string }> = ({ label, value, colorClass }) => (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding: '14px',
      textAlign: 'center'
    }}>
      <div className={colorClass} style={{
        fontSize: '24px',
        fontWeight: 700,
        letterSpacing: '-.5px',
        lineHeight: 1,
        marginBottom: '3px'
      }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '8px',
      marginBottom: '28px'
    }}>
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
