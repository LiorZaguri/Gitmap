import React from 'react';
import type { Phase, CommitType } from '../types';
import { TYPE_COLORS } from '../utils/classify';

interface PhaseDetailProps {
  phase: Phase | null;
  onClose: () => void;
}

export const PhaseDetail: React.FC<PhaseDetailProps> = ({ phase, onClose }) => {
  if (!phase) return null;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const dur = (a: string, b: string) => {
    const d = Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000);
    if (!d) return '1d';
    if (d < 7) return d + 'd';
    if (d < 30) return Math.round(d / 7) + 'w';
    return Math.round(d / 30) + 'mo';
  };

  const counts = {
    feat: phase.items.filter(x => x.type === 'feat').length,
    fix: phase.items.filter(x => x.type === 'fix').length,
    refactor: phase.items.filter(x => x.type === 'refactor').length,
    docs: phase.items.filter(x => x.type === 'docs').length,
    test: phase.items.filter(x => x.type === 'test').length,
    ci: phase.items.filter(x => x.type === 'ci').length,
    chore: phase.items.filter(x => x.type === 'chore').length,
    unknown: phase.items.filter(x => x.type === 'unknown').length,
  };

  const statusCls = `s-${phase.status}`;

  return (
    <div className="phase-popup" style={{ borderColor: `${phase.color}33`, marginTop: '16px' }}>
      <div className="popup-header">
        <div className="popup-dot" style={{ background: phase.color }}></div>
        <span className="popup-name">{phase.name}</span>
        <span className={`status-badge ${statusCls}`}>{phase.status}</span>
        <button className="popup-close" onClick={onClose}>×</button>
      </div>
      
      <div className="popup-meta">
        <span>📅 {fmtDate(phase.start)} → {fmtDate(phase.end)}</span>
        <span>⏱ {dur(phase.start, phase.end)}</span>
        <span>📝 {phase.items.length} commits</span>
        <span>🌿 {phase.branch}</span>
        <div className="popup-badges" style={{ marginLeft: 'auto' }}>
          {counts.feat > 0 && <span className="badge b-feat">{counts.feat} feat</span>}
          {counts.fix > 0 && <span className="badge b-fix">{counts.fix} fix</span>}
          {counts.refactor > 0 && <span className="badge b-ref">{counts.refactor} refactor</span>}
          {counts.docs > 0 && <span className="badge b-docs">{counts.docs} docs</span>}
          {counts.test > 0 && <span className="badge b-test">{counts.test} test</span>}
          {counts.ci > 0 && <span className="badge b-ci">{counts.ci} ci</span>}
          {counts.chore > 0 && <span className="badge b-chore">{counts.chore} chore</span>}
          {counts.unknown > 0 && <span className="badge b-unknown">{counts.unknown} unknown</span>}
        </div>
      </div>

      <div className="sub-road">
        <div className="sub-road-title">What happened in this phase</div>
        <div className="sub-road-wrap">
          <div className="sub-road-line"></div>
          {phase.items.slice(0, 25).map((item, idx) => (
            <div key={idx} className="sub-item">
              <div className="sub-node" style={{ background: TYPE_COLORS[item.type as CommitType] || '#888' }}></div>
              <div className="sub-content">
                <div className="sub-tag-row">
                  <span className={`ctag t-${item.type}`}>{item.type}</span>
                  <span className="sub-date">{new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="sub-msg">{item.msg}</div>
              </div>
            </div>
          ))}
          {phase.items.length > 25 && (
            <div className="sub-more">+{phase.items.length - 25} more commits in this phase</div>
          )}
        </div>
      </div>

      <style>{`
        .phase-popup { background: var(--bg2); border: 1px solid var(--border3); border-radius: 14px; overflow: hidden; animation: slideIn .2s ease; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        .popup-header { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border) }
        .popup-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0 }
        .popup-name { font-size: 15px; font-weight: 600; flex: 1 }
        .popup-close { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 18px; padding: 0 4px; line-height: 1 }
        .popup-close:hover { color: var(--text) }
        .popup-meta { display: flex; gap: 16px; padding: 10px 18px; background: var(--bg3); font-size: 12px; color: var(--text2); border-bottom: 1px solid var(--border) }
        .popup-meta span { display: flex; align-items: center; gap: 4px }
        .popup-badges { display: flex; gap: 6px }
        .badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 99px }
        .b-feat { background: rgba(0,208,132,0.1); color: var(--green) }
        .b-fix { background: rgba(255,85,85,0.1); color: #ff9999 }
        .b-ref { background: rgba(77,159,255,0.1); color: var(--blue) }
        .b-chore { background: rgba(145,145,164,0.1); color: var(--text2) }
        .b-docs { background: rgba(255,184,77,0.1); color: var(--amber) }
        .b-test { background: rgba(90,248,232,0.1); color: var(--teal) }
        .b-ci { background: rgba(167,139,250,0.1); color: var(--purple) }
        .b-unknown { background: rgba(156,163,175,0.1); color: #9ca3af }
        .status-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px }
        .s-active { background: rgba(0,208,132,0.1); color: var(--green) }
        .s-done { background: rgba(145,145,164,0.1); color: var(--text2) }
        .s-abandoned { background: rgba(255,85,85,0.1); color: var(--red) }
        .sub-road { padding: 16px 18px }
        .sub-road-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text3); margin-bottom: 12px }
        .sub-road-wrap { position: relative; padding-left: 20px }
        .sub-road-line { position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: linear-gradient(to bottom, var(--green), var(--blue), var(--purple)); border-radius: 1px; opacity: 0.4 }
        .sub-item { position: relative; display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px }
        .sub-node { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-left: -20px; z-index: 1; position: relative; margin-top: 2px; border: 2px solid var(--bg2) }
        .sub-content { flex: 1; background: var(--bg3); border-radius: var(--r); padding: 8px 11px; border: 1px solid var(--border) }
        .sub-tag-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px }
        .ctag { font-size: 10px; font-weight: 700; font-family: 'JetBrains Mono', monospace; padding: 1px 6px; border-radius: 4px }
        .sub-date { font-size: 10px; color: var(--text3); font-family: 'JetBrains Mono', monospace; margin-left: auto }
        .sub-msg { font-size: 12px; color: var(--text2); line-height: 1.4 }
        .sub-more { font-size: 11px; color: var(--text3); text-align: center; padding: 6px 0; font-family: 'JetBrains Mono', monospace }
        .t-feat { background: rgba(0,208,132,0.1); color: var(--green) }
        .t-fix { background: rgba(255,85,85,0.1); color: #ff9999 }
        .t-refactor { background: rgba(77,159,255,0.1); color: var(--blue) }
        .t-docs { background: rgba(255,184,77,0.1); color: var(--amber) }
        .t-test { background: rgba(90,248,232,0.1); color: var(--teal) }
        .t-ci { background: rgba(167,139,250,0.1); color: var(--purple) }
        .t-chore { background: rgba(145,145,164,0.1); color: var(--text2) }
        .t-unknown { background: rgba(156,163,175,0.1); color: #9ca3af }
      `}</style>
    </div>
  );
};
