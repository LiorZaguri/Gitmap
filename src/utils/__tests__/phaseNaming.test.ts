import { describe, it, expect } from 'vitest';
import { buildPhaseName } from '../phaseNaming';
import type { PhaseFingerprint, Commit } from '../../types';

const commits: Commit[] = [
  { sha: 'a', msg: 'feat(core): setup', fullMessage: 'feat(core): setup', body: undefined, date: '2024-01-01', author: 'A', branch: 'main', type: 'feat' }
];

function baseFingerprint(): PhaseFingerprint {
  return {
    dominantDomains: [],
    dominantTopics: [],
    dominantLabelsScopes: [],
    dominantWorkstreamTitles: [],
    contributors: ['A'],
    commitCount: 1,
    startDate: '2024-01-01',
    endDate: '2024-01-01',
    releaseFlags: [],
    namingConfidence: 0
  };
}

describe('phase naming priority', () => {
  it('prefers workstream title cluster', () => {
    const fp = baseFingerprint();
    fp.dominantWorkstreamTitles = [{ value: 'API overhaul', count: 3, ratio: 0.7 }];
    const name = buildPhaseName(fp, commits);
    expect(name.source).toBe('workstream');
  });

  it('falls back to domain then label', () => {
    const fp = baseFingerprint();
    fp.dominantDomains = [{ value: 'packages/api', count: 3, ratio: 0.6 }];
    const name = buildPhaseName(fp, commits);
    expect(name.source).toBe('domain');
  });
});
