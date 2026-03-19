import React from 'react';
import type { Commit, Phase, CommitType, HistoryQuality as HistoryQualityMetric } from '../types';

interface HistoryQualityProps {
  commits: Commit[];
  phases: Phase[];
  types: Record<CommitType, number>;
  contribs: string[];
  metric?: HistoryQualityMetric;
}

export const HistoryQuality: React.FC<HistoryQualityProps> = ({ types, contribs, metric }) => {
  const quality = metric;
  if (!quality) return null;
  const total = Object.values(types).reduce((a, b) => a + b, 0) || 1;
  const featPct = Math.round(((types.feat || 0) / total) * 100);
  const fixPct = Math.round(((types.fix || 0) / total) * 100);
  const contributors = contribs.length;

  const getColor = (score: number) => {
    if (score > 80) return 'var(--green)';
    if (score > 55) return 'var(--amber)';
    return 'var(--red)';
  };

  const featLine = featPct >= 35
    ? `${featPct}% feat commits suggests active development.`
    : featPct >= 20
      ? `${featPct}% feat commits suggests steady feature progress.`
      : `${featPct}% feat commits suggests low feature velocity.`;
  const fixLine = fixPct >= 35
    ? `${fixPct}% fix commits shows stability work dominating.`
    : fixPct >= 15
      ? `${fixPct}% fix commits is within a healthy range.`
      : `${fixPct}% fix commits indicates relatively few fixes.`;
  const contribLine = contributors <= 1
    ? 'Single contributor is a bus factor risk.'
    : contributors <= 3
      ? `${contributors} contributors means a small core team; bus factor risk is moderate.`
      : `${contributors} contributors suggests healthier ownership spread.`;

  return (
    <div className="ins-card" style={{ marginTop: '12px' }}>
      <div className="card-title">What this tells you</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ position: 'relative', width: '74px', height: '74px' }}>
          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="16" fill="none" stroke="var(--bg3)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={getColor(quality.score)}
              strokeWidth="3"
              strokeDasharray={`${quality.score}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700 }}>
          {quality.score}%
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="section-title" style={{ marginBottom: '6px' }}>
            History quality
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            PR coverage: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.prCoverage}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Path coherence: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.pathCoherence}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Structured commits: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.structuredCommits}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Release signals: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.releaseSignals}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Commit clarity: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.clarity}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Contributor continuity: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.continuity}%</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text2)' }}>
        {quality.summary}
      </div>
      <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
        {featLine} {fixLine} {contribLine}
      </div>
    </div>
  );
};
