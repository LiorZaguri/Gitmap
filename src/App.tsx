import type { CommitType } from './types';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import './App.css';
import { InputPanel } from './components/InputPanel';
import { StatsRow } from './components/StatsRow';
import { RoadMap } from './components/RoadMap';
import { PhaseDetail } from './components/PhaseDetail';
import { InsightsRow } from './components/InsightsRow';
import { HealthScore } from './components/HealthScore';
import { HistoryQuality } from './components/HistoryQuality';
import { useGitHub } from './hooks/useGitHub';

function App() {
  const { repo, commits, phases, types, contribs, totalDays, analysis, historyQuality, loading, loadingStage, error, generate } = useGitHub();
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
      <header className="hero-header">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '18px', opacity: 0.6 }}>
          <div style={{ width: '26px', height: '26px', background: 'var(--green)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={14} strokeWidth={2.2} color="#000" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text2)' }}>Roadmap Generator</span>
        </div>
        <h1 style={{ fontSize: '34px', fontWeight: 700, letterSpacing: '-1px', marginBottom: '8px', background: 'linear-gradient(135deg, #fff 30%, #555)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Your commits,<br />turned into a roadmap.
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)' }}>Reverse-engineer your project history into phases, timelines, and insights.</p>
      </header>

      <div className="input-panel-wrap">
        <InputPanel onGenerate={generate} loading={loading} error={error} />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div className="spinner"></div>
          <p style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>
            {loadingStage || 'Working...'}
          </p>
        </div>
      )}

      {commits && phases && analysis && (
        <div style={{ marginTop: '20px' }}>
          <StatsRow commitCount={commits.length} phases={phases} totalDays={totalDays || 1} />
          <div className="analysis-line">
            {phases.length} phases · {commits.length} commits · analysed{analysis.partial ? ' (partial)' : ''}
          </div>
          <div className="road-section">
            <RoadMap 
              phases={phases} 
              onPinClick={handlePinClick} 
              activePhaseIdx={selectedPhaseIdx}
            />
          </div>
          
          {selectedPhase && (
            <PhaseDetail
              key={`${selectedPhase.name}-${selectedPhase.start}-${selectedPhase.end}`}
              phase={selectedPhase}
              repo={repo}
              analysis={analysis}
              onClose={() => setSelectedPhaseIdx(null)}
            />
          )}

          <div className="health-grid">
            <HealthScore commits={commits} phases={phases} />
            <HistoryQuality types={types || {} as Record<CommitType, number>} contribs={contribs || []} metric={historyQuality} />
          </div>

          <InsightsRow types={types || {} as Record<CommitType, number>} contribs={contribs || []} commits={commits} />
        </div>
      )}
    </div>
  );
}

export default App;
