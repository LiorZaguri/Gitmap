import { describe, it, expect } from 'vitest';
import { calculateRoadmapConfidence } from '../roadmapConfidence';
import { calculateHistoryQuality } from '../historyQuality';
import type { Commit, PhaseFingerprint, WorkItem, Phase } from '../../types';
import type { BoundarySelection } from '../boundaries';

function makeWorkItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    kind: 'commit_window',
    title: 'Work',
    bodySummary: undefined,
    bodyText: undefined,
    commitShas: [],
    changedFiles: [],
    pathDomains: [],
    labels: [],
    typesScopes: [],
    topicTokens: [],
    contributors: [],
    startDate: '2024-01-01',
    endDate: '2024-01-02',
    releaseFlags: [],
    sourceBranchHint: undefined,
    confidence: 0.3,
    ...overrides
  };
}

function makeFingerprint(): PhaseFingerprint {
  return {
    dominantDomains: [{ value: 'packages/api', count: 3, ratio: 0.6 }],
    dominantTopics: [{ token: 'api', weight: 3, ratio: 0.5 }],
    dominantLabelsScopes: [],
    dominantWorkstreamTitles: [],
    contributors: ['A'],
    commitCount: 2,
    startDate: '2024-01-01',
    endDate: '2024-01-02',
    releaseFlags: ['tag-latest'],
    namingConfidence: 0.6
  };
}

describe('confidence metrics', () => {
  it('calculates roadmap confidence', () => {
    const workItems = [makeWorkItem({ kind: 'pull_request', releaseFlags: ['tag-latest'] })];
    const selection: BoundarySelection = { boundaries: [], scores: [], reasons: {} };
    const phases = [{
      workItems,
      commits: [] as Commit[],
      fingerprint: makeFingerprint(),
      workItemStart: 0,
      workItemEnd: 1
    }];
    const result = calculateRoadmapConfidence(phases, workItems, selection);
    expect(result.overall.score).toBeGreaterThan(0);
  });

  it('calculates history quality', () => {
    const commits: Commit[] = [
      {
        sha: 'a',
        msg: 'feat(core): add api',
        fullMessage: 'feat(core): add api\n\nAdd the first API route.\n\nWhy: clients need a stable endpoint.',
        body: 'Add the first API route.\n\nWhy: clients need a stable endpoint.',
        date: '2024-01-01',
        author: 'A',
        branch: 'main',
        type: 'feat'
      }
    ];
    const workItems = [makeWorkItem({ kind: 'pull_request', contributors: ['A'] })];
    const phases: Phase[] = [
      {
        name: 'API',
        branch: 'main',
        items: commits,
        start: '2024-01-01',
        end: '2024-01-01',
        color: '#000',
        status: 'done',
        idx: 0,
        fingerprint: makeFingerprint()
      }
    ];
    const quality = calculateHistoryQuality(commits, phases, workItems);
    expect(quality.score).toBeGreaterThan(0);
    expect(quality.explanationDepth).toBeGreaterThan(0);
    expect(quality.structuredCommits).toBeGreaterThan(0);
  });
});
