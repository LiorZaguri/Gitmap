import { describe, expect, it } from 'vitest';
import { calculateHistoryQuality } from '../historyQuality';
import type { Commit, Phase, WorkItem } from '../../types';

function makeCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: 'a',
    msg: 'feat(auth): add login',
    fullMessage: 'feat(auth): add login',
    body: undefined,
    date: '2024-01-01',
    author: 'A',
    branch: 'main',
    type: 'feat',
    ...overrides
  };
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: 'pull_request',
    title: 'Auth login',
    bodySummary: undefined,
    bodyText: undefined,
    commitShas: ['a'],
    changedFiles: [],
    pathDomains: ['packages/auth'],
    labels: [],
    typesScopes: ['feat(auth)'],
    topicTokens: [],
    contributors: ['A'],
    startDate: '2024-01-01',
    endDate: '2024-01-01',
    releaseFlags: [],
    confidence: 0.7,
    ...overrides
  };
}

describe('history quality explanation depth', () => {
  it('rewards explanatory commit and PR bodies', () => {
    const commits = [
      makeCommit({
        msg: 'feat(auth): add login flow',
        fullMessage: 'feat(auth): add login flow\n\nAdd login support.\n\nWhy: users need authenticated sessions.\nHow: wire a token exchange flow.\n\nCloses #12',
        body: 'Add login support.\n\nWhy: users need authenticated sessions.\nHow: wire a token exchange flow.\n\nCloses #12'
      })
    ];
    const workItems = [
      makeWorkItem({
        bodyText: 'This PR introduces login.\n\nWhy: sign-in was missing.\nHow: add token exchange and session persistence.'
      })
    ];
    const phases: Phase[] = [{
      name: 'Auth',
      branch: 'main',
      items: commits,
      start: '2024-01-01',
      end: '2024-01-01',
      color: '#000',
      status: 'done',
      idx: 0,
      fingerprint: {
        dominantDomains: [{ value: 'packages/auth', count: 1, ratio: 1 }],
        dominantTopics: [{ token: 'auth', weight: 1, ratio: 1 }],
        dominantLabelsScopes: [{ value: 'feat(auth)', count: 1, ratio: 1 }],
        dominantWorkstreamTitles: [{ value: 'Auth login', count: 1, ratio: 1 }],
        contributors: ['A'],
        commitCount: 1,
        startDate: '2024-01-01',
        endDate: '2024-01-01',
        releaseFlags: [],
        namingConfidence: 1
      }
    }];

    const quality = calculateHistoryQuality(commits, phases, workItems);
    expect(quality.explanationDepth).toBeGreaterThanOrEqual(90);
    expect(quality.structuredCommits).toBe(100);
    expect(quality.typeCoverage).toBe(100);
    expect(quality.scopeCoverage).toBe(100);
    expect(quality.subjectStyle).toBe(100);
    expect(quality.footerSignals).toBeGreaterThan(50);
  });
});
