import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Commit } from '../../types';
import { buildPhases } from '../phases';

const base = new Date('2024-01-01T00:00:00Z').getTime();

const makeCommit = (i: number, branch: string): Commit => ({
  sha: `s${i}`,
  msg: 'feat: change',
  date: new Date(base + i * 86400000).toISOString(),
  author: 'Dev',
  branch,
  type: 'feat'
});

describe('buildPhases grouping', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses branch grouping when branch ratio is high', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01T00:00:00Z'));
    const commits = [
      ...Array.from({ length: 7 }, (_, i) => makeCommit(i, 'main')),
      ...Array.from({ length: 3 }, (_, i) => makeCommit(i + 7, 'feature/api'))
    ];

    const result = buildPhases(commits);
    expect(result.grouping.mode).toBe('branch');
    expect(result.grouping.label).toBe('branch');
  });

  it('labels mixed signals near the cutoff', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01T00:00:00Z'));
    const commits = [
      ...Array.from({ length: 8 }, (_, i) => makeCommit(i, 'main')),
      ...Array.from({ length: 2 }, (_, i) => makeCommit(i + 8, 'feature/ui'))
    ];

    const result = buildPhases(commits);
    expect(result.grouping.label).toBe('mixed');
  });
});
