import React, { useState } from 'react';
import { normalizeRepoInput } from '../utils/normalizeRepo';

interface InputPanelProps {
  onGenerate: (repo: string, token: string) => void;
  loading: boolean;
  error: string | null;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  onGenerate,
  loading,
  error
}) => {
  const [repo, setRepo] = useState(() => localStorage.getItem('gitmap_repo') ?? '');
  const [token, setToken] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);

  const handleGenerate = () => {
    const { value, error } = normalizeRepoInput(repo);
    setRepoError(error);
    if (error) {
      return;
    }
    if (value !== repo) setRepo(value);
    onGenerate(value, token);
  };

  return (
    <div className="input-panel">
      {error && <div className="error-box" style={{ marginBottom: '12px' }}>{error}</div>}
      <div className="input-grid">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.08em' }}>Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => {
              setRepo(e.target.value);
              if (repoError) setRepoError(null);
            }}
            onBlur={() => {
              const { value, error } = normalizeRepoInput(repo);
              setRepoError(error);
              if (!error && value !== repo) setRepo(value);
            }}
            placeholder="owner/repo or https://github.com/owner/repo"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', outline: 'none' }}
          />
          {repoError && (
            <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '6px' }}>
              {repoError}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.08em' }}>
            GITHUB TOKEN <span style={{ color: '#55555f', fontWeight: 400 }}>(optional for public repos)</span>
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
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=Roadmap"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--green)', textDecoration: 'none' }}
            >
              Create a GitHub token →
            </a>
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
