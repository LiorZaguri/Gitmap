import { describe, it, expect } from 'vitest';
import { buildWorkItems } from '../workItems';
import type { Commit } from '../../types';
import type { PullRequestMeta, ReleaseMeta } from '../github';

const commits: Commit[] = [
  { sha: 'a', msg: 'feat(api): add endpoint', date: '2024-01-01', author: 'A', branch: 'main', type: 'feat' },
  { sha: 'b', msg: 'feat(api): add tests', date: '2024-01-02', author: 'A', branch: 'main', type: 'test' },
  { sha: 'c', msg: 'fix(ui): tweak', date: '2024-01-03', author: 'B', branch: 'main', type: 'fix' }
];

const prs: Record<string, PullRequestMeta> = {
  a: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/index.ts'], mergedAt: '2024-01-02' },
  b: { number: 1, title: 'API endpoint', body: 'details', files: ['packages/api/src/index.ts'], mergedAt: '2024-01-02' }
};

const releaseMeta: ReleaseMeta = { tag: 'v1.0.0', source: 'tag' };

const pathDomains = { a: 'packages/api', b: 'packages/api', c: 'packages/web' };

describe('work item building', () => {
  it('groups PR commits and keeps non-PR commits in windows', () => {
    const items = buildWorkItems(commits, prs, { windowSize: 2, pathDomains, releaseMeta });
    expect(items.length).toBe(2);
    expect(items[0].kind).toBe('pull_request');
    expect(items[0].commitShas).toEqual(['a', 'b']);
    expect(items[1].kind).toBe('commit_window');
    expect(items[1].commitShas).toEqual(['c']);
  });

  it('adds release flags when markers present', () => {
    const items = buildWorkItems(commits, prs, { windowSize: 2, pathDomains, releaseMeta });
    expect(items[0].releaseFlags).toContain('tag-latest');
  });
});
