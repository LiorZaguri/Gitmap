import type { CommitType } from './types';
import { useState } from 'react';
import './App.css';
import { InputPanel } from './components/InputPanel';
import { StatsRow } from './components/StatsRow';
import { RoadMap } from './components/RoadMap';
import { PhaseDetail } from './components/PhaseDetail';
import { InsightsRow } from './components/InsightsRow';
import { ContributorHeatmap } from './components/ContributorHeatmap';
import { HealthScore } from './components/HealthScore';
import { useGitHub } from './hooks/useGitHub';

function App() {
  const { commits, phases, types, contribs, totalDays, loading, loadingStage, error, generate } = useGitHub();
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState<number | null>(null);

  const handlePinClick = (idx: number) => {
    if (selectedPhaseIdx === idx) {
      setSelectedPhaseIdx(null);
    } else {
      setSelectedPhaseIdx(idx);
    }
  };

  const selectedPhase = selectedPhaseIdx !== null && phases ? phases[selectedPhaseIdx] : null;

  return (
    <div className="page">
      <header style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '18px', opacity: 0.6 }}>
          <div style={{ width: '26px', height: '26px', background: 'var(--green)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="#000"><path d="M7 1L9 5H13L9.5 8L11 12L7 9.5L3 12L4.5 8L1 5H5Z"/></svg>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text2)' }}>Roadmap Generator</span>
        </div>
        <h1 style={{ fontSize: '34px', fontWeight: 700, letterSpacing: '-1px', marginBottom: '8px', background: 'linear-gradient(135deg, #fff 30%, #555)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Your commits,<br />turned into a roadmap.
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text2)' }}>Reverse-engineer your project history into phases, timelines, and insights.</p>
      </header>

      <InputPanel onGenerate={generate} loading={loading} error={error} />

      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div className="spinner"></div>
          <p style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>
            {loadingStage || 'Working...'}
          </p>
        </div>
      )}

      {commits && phases && (
        <div style={{ marginTop: '20px' }}>
          <StatsRow commitCount={commits.length} phases={phases} totalDays={totalDays || 1} />
          
          <p style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', marginBottom: '16px', fontFamily: 'JetBrains Mono, monospace' }}>
            Click any pin to explore that phase ↓
          </p>

          <RoadMap 
            phases={phases} 
            onPinClick={handlePinClick} 
            activePhaseIdx={selectedPhaseIdx}
          />
          
          <PhaseDetail phase={selectedPhase} onClose={() => setSelectedPhaseIdx(null)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <HealthScore commits={commits} phases={phases} />
          </div>

          <InsightsRow types={types || {} as Record<CommitType, number>} contribs={contribs || []} commits={commits} />
          
          <ContributorHeatmap commits={commits} />
        </div>
      )}
    </div>
  );
}

export default App;
