import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Commit, Phase } from '../../types';
import { calculateHealth } from '../health';

const makeCommit = (i: number, author: string): Commit => ({
  sha: `c${i}`,
  msg: 'feat: work',
  date: new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
  author,
  branch: 'main',
  type: 'feat'
});

describe('calculateHealth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns transparent component scores', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-10T00:00:00Z'));
    const commits: Commit[] = [
      makeCommit(0, 'A'),
      makeCommit(1, 'A'),
      makeCommit(2, 'A'),
      makeCommit(3, 'B'),
      makeCommit(4, 'B'),
      makeCommit(5, 'B'),
      makeCommit(6, 'B')
    ];
    const phases: Phase[] = [
      { name: 'Phase 1', branch: 'main', items: commits.slice(0, 3), start: commits[0].date, end: commits[2].date, color: '#fff', status: 'done', idx: 0 },
      { name: 'Phase 2', branch: 'main', items: commits.slice(3), start: commits[3].date, end: commits[6].date, color: '#fff', status: 'abandoned', idx: 1 }
    ];

    const health = calculateHealth(commits, phases);
    expect(health.activity).toBe(28);
    expect(health.stability).toBe(50);
    expect(health.freshness).toBe(100);
    expect(health.collaboration).toBe(50);
    expect(health.score).toBe(57);
  });
});
