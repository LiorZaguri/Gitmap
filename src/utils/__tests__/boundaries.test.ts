import { describe, it, expect } from 'vitest';
import { scoreWorkItemBoundaries, selectBoundaries } from '../boundaries';
import type { WorkItem } from '../../types';

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    kind: 'commit_window',
    title: 'Work',
    bodySummary: undefined,
    commitShas: [],
    changedFiles: [],
    pathDomains: [],
    labels: [],
    typesScopes: [],
    topicTokens: [],
    contributors: [],
    startDate: '2024-01-01',
    endDate: '2024-01-01',
    releaseFlags: [],
    sourceBranchHint: undefined,
    confidence: 0.3,
    ...overrides
  };
}

describe('boundary scoring', () => {
  it('scores higher for domain shifts', () => {
    const items = [
      makeItem({ pathDomains: ['packages/api'] }),
      makeItem({ pathDomains: ['packages/web'] })
    ];
    const scores = scoreWorkItemBoundaries(items);
    expect(scores[0].components.pathDomain.value).toBeGreaterThan(0.5);
  });

  it('merges tiny phases when boundary is weak', () => {
    const items = [
      makeItem({ pathDomains: ['a'] }),
      makeItem({ pathDomains: ['a'] }),
      makeItem({ pathDomains: ['b'] }),
      makeItem({ pathDomains: ['b'] })
    ];
    const scores = scoreWorkItemBoundaries(items);
    const selection = selectBoundaries(items, scores, { minPhaseSize: 3, minScore: 0.9 });
    expect(selection.boundaries.length).toBe(0);
  });
});
