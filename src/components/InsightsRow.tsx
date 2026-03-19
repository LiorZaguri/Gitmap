import React from 'react';
import type { Commit, CommitType } from '../types';
import { TYPE_COLORS } from '../utils/classify';

interface InsightsRowProps {
  types: Record<CommitType, number>;
  contribs: string[];
  commits: Commit[];
}

export const InsightsRow: React.FC<InsightsRowProps> = ({ types, contribs, commits }) => {
  const total = Object.values(types).reduce((a, b) => a + b, 0);

  const getTypePct = (count: number) => {
    return Math.round((count / total) * 100);
  };

  return (
    <div className="insights-grid">
      <div className="ins-card">
        <div className="ins-title">Commit breakdown</div>
        {Object.entries(types)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <div key={type} className="type-row">
              <span className="ctag" style={{ 
                width: '62px', 
                textAlign: 'center', 
                fontSize: '10px', 
                fontWeight: 700, 
                padding: '1px 6px', 
                borderRadius: '4px',
                background: `${TYPE_COLORS[type as CommitType]}1a`,
                color: TYPE_COLORS[type as CommitType]
              }}>{type}</span>
              <div className="type-bar">
                <div className="type-fill" style={{ 
                  width: `${getTypePct(count)}%`, 
                  background: TYPE_COLORS[type as CommitType] 
                }}></div>
              </div>
              <span className="type-pct">{count} ({getTypePct(count)}%)</span>
            </div>
          ))}
      </div>

      <div className="ins-card">
        <div className="ins-title">Contributors</div>
        {contribs.slice(0, 8).map(c => {
          const initials = c.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
          const count = commits.filter(x => x.author === c).length;
          return (
            <div key={c} className="contrib-row">
              <div className="avatar">{initials}</div>
              <span className="cname">{c}</span>
              <span className="ccount">{count}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .ins-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 16px; }
        .ins-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text3); margin-bottom: 12px; }
        .type-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .type-bar { flex: 1; height: 4px; background: var(--bg4); border-radius: 2px; overflow: hidden; }
        .type-fill { height: 100%; border-radius: 2px; }
        .type-pct { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--text2); width: 50px; text-align: right; flex-shrink: 0; }
        .contrib-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--green-dim); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--green); flex-shrink: 0; border: 1px solid rgba(0,208,132,0.2); }
        .cname { flex: 1; font-size: 12px; color: var(--text); }
        .ccount { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--text2); }
      `}</style>
    </div>
  );
};
