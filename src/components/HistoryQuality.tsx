import React from 'react';
import type { CommitType, HistoryQuality as HistoryQualityMetric } from '../types';

interface HistoryQualityProps {
  types: Record<CommitType, number>;
  contribs: string[];
  metric?: HistoryQualityMetric;
}

export const HistoryQuality: React.FC<HistoryQualityProps> = ({ types, contribs, metric }) => {
  const quality = metric;
  if (!quality) return null;
  void types;
  const contributors = contribs.length;

  const getColor = (score: number) => {
    if (score > 80) return 'var(--green)';
    if (score > 55) return 'var(--amber)';
    return 'var(--red)';
  };

  const hygieneLine = quality.structuredCommits >= 65 && quality.clarity >= 65
    ? 'Good repo signal: commit subjects are mostly specific and consistently structured.'
    : 'Needs work: generic or unscoped commit subjects make the roadmap harder to infer.';
  const conventionLine = quality.typeCoverage >= 65 && quality.subjectStyle >= 65
    ? 'Good repo signal: commit headers mostly follow a changelog-friendly convention.'
    : 'Needs work: commit headers are not consistent enough for reliable changelog-style interpretation.';
  const scopeLine = quality.scopeCoverage >= 50
    ? 'Good repo signal: scopes are descriptive and repeated enough to improve phase naming.'
    : 'Needs work: scopes are missing, too generic, or too inconsistent to help roadmap naming.';
  const explanationLine = quality.explanationDepth >= 45
    ? 'Good repo signal: commit or PR bodies often explain why the change happened and how it was done.'
    : 'Needs work: commit and PR bodies rarely capture motivation or implementation details.';
  const footerLine = quality.footerSignals >= 30
    ? 'Good repo signal: issue-closing or breaking-change footers create stronger release history.'
    : 'Needs work: footer signals like `Closes #123` or `BREAKING CHANGE:` are mostly absent.';
  const workflowLine = quality.prCoverage >= 50 || quality.releaseSignals >= 50
    ? 'Good repo signal: PR/release markers make milestones and workstreams easier to follow.'
    : 'Needs work: sparse PR or release markers reduce confidence in phase boundaries.';
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
            Type coverage: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.typeCoverage}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Scope coverage: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.scopeCoverage}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Subject style: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.subjectStyle}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Footer signals: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.footerSignals}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Release signals: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.releaseSignals}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Commit clarity: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.clarity}%</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>
            Explanatory bodies: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{quality.explanationDepth}%</span>
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
        {hygieneLine} {conventionLine} {scopeLine} {explanationLine} {footerLine} {workflowLine} {contribLine}
      </div>
    </div>
  );
};
