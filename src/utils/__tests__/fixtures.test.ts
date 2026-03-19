import { describe, it, expect } from 'vitest';
import { buildWorkItems } from '../workItems';
import { buildPhaseFingerprint } from '../phaseFingerprint';
import { buildPhaseName } from '../phaseNaming';
import { scoreWorkItemBoundaries, selectBoundaries } from '../boundaries';
import type { Commit, WorkItem } from '../../types';
import type { PullRequestMeta, ReleaseMeta } from '../github';

function makeCommit(sha: string, msg: string, date: string, author: string, type: Commit['type']): Commit {
  return { sha, msg, date, author, branch: 'main', type };
}

function buildPhasesFromWorkItems(workItems: WorkItem[], commits: Commit[]) {
  const commitBySha = new Map(commits.map(c => [c.sha, c]));
  const scores = scoreWorkItemBoundaries(workItems);
  const selection = selectBoundaries(workItems, scores, { minGap: 2, minScore: 0.75, minPhaseSize: 2, maxPhaseSize: 8 });
  const boundaries = selection.boundaries.slice().sort((a, b) => a - b);
  const groups: { workItems: WorkItem[]; commits: Commit[] }[] = [];
  let start = 0;
  boundaries.forEach(boundary => {
    const slice = workItems.slice(start, boundary);
    const sliceCommits = slice.flatMap(item => item.commitShas.map(sha => commitBySha.get(sha)).filter(Boolean) as Commit[]);
    groups.push({ workItems: slice, commits: sliceCommits });
    start = boundary;
  });
  const tail = workItems.slice(start);
  const tailCommits = tail.flatMap(item => item.commitShas.map(sha => commitBySha.get(sha)).filter(Boolean) as Commit[]);
  if (tail.length > 0) groups.push({ workItems: tail, commits: tailCommits });
  return groups;
}

function namePhase(workItems: WorkItem[], commits: Commit[]) {
  const fp = buildPhaseFingerprint(workItems, commits);
  return buildPhaseName(fp, commits).name;
}

describe('fixture-style repo histories', () => {
  it('strong PR discipline yields PR-based work items', () => {
    const commits = [
      makeCommit('a', 'feat(api): add endpoint', '2024-01-01', 'A', 'feat'),
      makeCommit('b', 'feat(api): add tests', '2024-01-02', 'A', 'test'),
      makeCommit('c', 'fix(ui): tweak', '2024-01-03', 'B', 'fix')
    ];
    const prs: Record<string, PullRequestMeta> = {
      a: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/index.ts'], mergedAt: '2024-01-02' },
      b: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/index.ts'], mergedAt: '2024-01-02' }
    };
    const pathDomains = { a: 'packages/api', b: 'packages/api', c: 'packages/web' };
    const items = buildWorkItems(commits, prs, { windowSize: 2, pathDomains });
    expect(items[0].kind).toBe('pull_request');
    expect(items[0].title).toBe('API endpoint');
  });

  it('squash-merge history falls back to commit windows', () => {
    const commits = [
      makeCommit('a', 'feat(core): setup', '2024-01-01', 'A', 'feat'),
      makeCommit('b', 'feat(core): wire', '2024-01-02', 'A', 'feat'),
      makeCommit('c', 'feat(core): polish', '2024-01-03', 'A', 'feat')
    ];
    const items = buildWorkItems(commits, {}, { windowSize: 2 });
    expect(items[0].kind).toBe('commit_window');
    expect(items.length).toBeGreaterThan(1);
  });

  it('monorepo domains influence naming', () => {
    const commits = [
      makeCommit('a', 'feat(api): add endpoint', '2024-01-01', 'A', 'feat'),
      makeCommit('b', 'feat(api): add schema', '2024-01-02', 'A', 'feat')
    ];
    const prs: Record<string, PullRequestMeta> = {
      a: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/index.ts'], mergedAt: '2024-01-02' },
      b: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/schema.ts'], mergedAt: '2024-01-02' }
    };
    const pathDomains = { a: 'packages/api', b: 'packages/api' };
    const items = buildWorkItems(commits, prs, { windowSize: 2, pathDomains });
    const groups = buildPhasesFromWorkItems(items, commits);
    const name = namePhase(groups[0].workItems, groups[0].commits);
    expect(name.toLowerCase()).toContain('api');
  });

  it('messy commits still yield a deterministic label-based name', () => {
    const commits = [
      makeCommit('a', 'wip', '2024-01-01', 'A', 'chore'),
      makeCommit('b', 'tmp', '2024-01-02', 'A', 'chore')
    ];
    const items = buildWorkItems(commits, {}, { windowSize: 2 });
    const groups = buildPhasesFromWorkItems(items, commits);
    const fp = buildPhaseFingerprint(groups[0].workItems, groups[0].commits);
    const result = buildPhaseName(fp, groups[0].commits);
    expect(result.source).toBe('label-scope');
    expect(result.name).toMatch(/chore/i);
  });

  it('release-heavy repo flags release signals', () => {
    const commits = [
      makeCommit('a', 'chore: release v1.0.0', '2024-01-01', 'A', 'chore'),
      makeCommit('b', 'fix: hotfix followup', '2024-01-02', 'A', 'fix')
    ];
    const releaseMeta: ReleaseMeta = { tag: 'v1.0.0', source: 'tag' };
    const items = buildWorkItems(commits, {}, { windowSize: 2, releaseMeta });
    expect(items[0].releaseFlags.length).toBeGreaterThan(0);
  });
});
