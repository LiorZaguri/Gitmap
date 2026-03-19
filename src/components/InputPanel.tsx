import React, { useState } from 'react';

interface InputPanelProps {
  onGenerate: (repo: string, token: string) => void;
  loading: boolean;
}

export const InputPanel: React.FC<InputPanelProps> = ({ onGenerate, loading }) => {
  const [repo, setRepo] = useState(() => localStorage.getItem('gitmap_repo') ?? '');
  const [token, setToken] = useState('');

  const handleGenerate = () => {
    if (!repo || !repo.includes('/')) {
      alert('Please enter a valid repo (owner/repo)');
      return;
    }
    onGenerate(repo, token);
  };

  return (
    <div className="input-panel">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.08em' }}>Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.08em' }}>
            GitHub Token (optional)
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', outline: 'none' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            Optional: use a token for higher rate limits and private repos. Token is used only for this session and is not stored.
          </div>
        </div>
      </div>
      <button className="gen-btn" onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Roadmap'}
      </button>
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
        Token needs Contents: Read-only. <a href="https://github.com/settings/tokens/new?scopes=repo&description=Roadmap" target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>Create one →</a>
      </p>
    </div>
  );
};
