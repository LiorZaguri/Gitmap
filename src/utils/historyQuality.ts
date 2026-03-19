import type { Commit, HistoryQuality, Phase, WorkItem } from '../types';
import { STOP_WORDS } from './classify';

const GENERIC_PATTERNS = [
  /^wip\b/i,
  /^fix\b/i,
  /^update\b/i,
  /^misc\b/i,
  /^chore\b/i,
  /^refactor\b/i,
  /^cleanup\b/i,
  /^temp\b/i,
  /^tmp\b/i
];

const GENERIC_NAMES = new Set(['work', 'update', 'changes', 'misc', 'cleanup', 'chore', 'refactor']);

const WEIGHTS = {
  prCoverage: 0.2,
  pathCoherence: 0.2,
  structuredCommits: 0.18,
  releaseSignals: 0.12,
  clarity: 0.15,
  continuity: 0.15
};

function tokenizeMessage(msg: string) {
  return msg
    .toLowerCase()
    .split(/[\s():/.-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function isGenericMessage(msg: string) {
  const trimmed = msg.trim();
  if (!trimmed) return true;
  return GENERIC_PATTERNS.some(re => re.test(trimmed));
}

function isClearMessage(msg: string) {
  const trimmed = msg.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase().startsWith('merge')) return false;
  if (trimmed.toLowerCase().startsWith('revert')) return false;
  if (isGenericMessage(trimmed)) return false;
  const tokens = tokenizeMessage(trimmed);
  return trimmed.length >= 12 && tokens.length >= 2;
}

function buildTokenCounts(commits: Commit[]) {
  const counts: Record<string, number> = {};
  commits.forEach(c => {
    if (!c.msg) return;
    if (c.msg.toLowerCase().startsWith('merge')) return;
    if (c.msg.toLowerCase().startsWith('revert')) return;
    tokenizeMessage(c.msg).forEach(token => {
      counts[token] = (counts[token] || 0) + 1;
    });
  });
  return counts;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key in a) {
    const av = a[key];
    normA += av * av;
    if (b[key]) dot += av * b[key];
  }
  for (const key in b) {
    const bv = b[key];
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function scoreCommitClarity(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const clear = commits.filter(c => isClearMessage(c.msg)).length;
  return (clear / commits.length) * 100;
}

function scoreWorkstreamCoherence(phases: Phase[]) {
  if (phases.length === 0) return 0;
  const ratios = phases.map(phase => {
    const counts = buildTokenCounts(phase.items);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const top = Object.values(counts).sort((a, b) => b - a)[0] || 0;
    return top / total;
  });
  return (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100;
}

function scoreNamingConfidence(phases: Phase[]) {
  if (phases.length === 0) return 0;
  const unique = new Set(phases.map(p => p.name.toLowerCase()));
  const uniqueRatio = unique.size / phases.length;
  const quality: number[] = phases.map(p => {
    const name = p.name?.trim().toLowerCase() || '';
    if (!name) return 0;
    if (name.startsWith('work ·')) return 0;
    if (GENERIC_NAMES.has(name)) return 0;
    if (name.length < 5) return 0;
    return 1;
  });
  const avg = quality.reduce((a, b) => a + b, 0) / quality.length;
  return avg * uniqueRatio * 100;
}

function scoreStructuredCommits(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const structured = commits.filter(c => /\w+\(([^)]+)\):/.test(c.msg)).length;
  return (structured / commits.length) * 100;
}

function scorePrCoverage(workItems: WorkItem[]) {
  if (workItems.length === 0) return 0;
  const prItems = workItems.filter(item => item.kind === 'pull_request').length;
  return (prItems / workItems.length) * 100;
}

function scoreReleaseSignals(workItems: WorkItem[], phases: Phase[]) {
  const workItemRelease = workItems.filter(item => item.releaseFlags.length > 0).length;
  const phaseRelease = phases.filter(phase => phase.fingerprint?.releaseFlags?.length).length;
  const total = Math.max(workItems.length, phases.length, 1);
  return ((workItemRelease + phaseRelease) / total) * 100;
}

function scoreContributorContinuity(workItems: WorkItem[]) {
  if (workItems.length === 0) return 0;
  let overlaps = 0;
  let pairs = 0;
  for (let i = 1; i < workItems.length; i += 1) {
    const prev = new Set(workItems[i - 1].contributors);
    const next = new Set(workItems[i].contributors);
    if (prev.size === 0 || next.size === 0) continue;
    const shared = Array.from(prev).filter(name => next.has(name)).length;
    const ratio = shared / Math.max(prev.size, next.size);
    overlaps += ratio;
    pairs += 1;
  }
  if (pairs === 0) return 0;
  return (overlaps / pairs) * 100;
}

function buildSummary(score: number, weakestKey: keyof HistoryQuality) {
  if (score >= 75) {
    return 'Strong semantic signal: history is structured, consistent, and easy to interpret.';
  }
  if (score >= 55) {
    return 'Moderate semantic signal: history is usable but could be cleaner or more consistent.';
  }
  if (weakestKey === 'prCoverage') {
    return 'Weak semantic signal: PR linkage is sparse, making workstreams harder to follow.';
  }
  if (weakestKey === 'pathCoherence') {
    return 'Weak semantic signal: file-path coherence is low across work items.';
  }
  if (weakestKey === 'structuredCommits') {
    return 'Weak semantic signal: commit messages lack consistent structure.';
  }
  if (weakestKey === 'releaseSignals') {
    return 'Weak semantic signal: release markers are missing or inconsistent.';
  }
  if (weakestKey === 'clarity') {
    return 'Weak semantic signal: commit wording is too noisy or generic.';
  }
  return 'Weak semantic signal: contributor/workstream continuity is low.';
}

export function calculateHistoryQuality(commits: Commit[], phases: Phase[], workItems: WorkItem[]): HistoryQuality {
  const prCoverage = scorePrCoverage(workItems);
  const pathCoherence = scoreWorkstreamCoherence(phases);
  const structuredCommits = scoreStructuredCommits(commits);
  const releaseSignals = scoreReleaseSignals(workItems, phases);
  const clarity = scoreCommitClarity(commits);
  const continuity = scoreContributorContinuity(workItems);

  const weightedScore =
    (prCoverage / 100) * WEIGHTS.prCoverage +
    (pathCoherence / 100) * WEIGHTS.pathCoherence +
    (structuredCommits / 100) * WEIGHTS.structuredCommits +
    (releaseSignals / 100) * WEIGHTS.releaseSignals +
    (clarity / 100) * WEIGHTS.clarity +
    (continuity / 100) * WEIGHTS.continuity;

  const score = Math.round(weightedScore * 100);

  const components: Array<[keyof HistoryQuality, number]> = [
    ['prCoverage', prCoverage],
    ['pathCoherence', pathCoherence],
    ['structuredCommits', structuredCommits],
    ['releaseSignals', releaseSignals],
    ['clarity', clarity],
    ['continuity', continuity]
  ];
  const weakest = components.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'clarity';
  const summary = buildSummary(score, weakest);

  return {
    score,
    prCoverage: Math.round(prCoverage),
    pathCoherence: Math.round(pathCoherence),
    structuredCommits: Math.round(structuredCommits),
    releaseSignals: Math.round(releaseSignals),
    clarity: Math.round(clarity),
    continuity: Math.round(continuity),
    summary
  };
}
