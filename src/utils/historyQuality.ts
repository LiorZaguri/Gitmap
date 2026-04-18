import type { Commit, HistoryQuality, Phase, WorkItem } from '../types';
import { STOP_WORDS, parseConventionalHeader } from './classify';

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

const WEIGHTS = {
  prCoverage: 0.12,
  pathCoherence: 0.14,
  structuredCommits: 0.12,
  typeCoverage: 0.08,
  scopeCoverage: 0.08,
  subjectStyle: 0.1,
  footerSignals: 0.08,
  releaseSignals: 0.08,
  clarity: 0.1,
  explanationDepth: 0.06,
  continuity: 0.04
};

const CONVENTIONAL_TYPES = new Set(['build', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'style', 'test']);
const GENERIC_SCOPES = new Set(['core', 'misc', 'general', 'all', 'repo', 'app', 'project']);

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


function scoreCommitClarity(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const clear = commits.filter(c => isClearMessage(c.msg)).length;
  return (clear / commits.length) * 100;
}

function scoreStructuredCommits(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const structured = commits.filter(commit => hasConventionalHeader(commit.msg)).length;
  return (structured / commits.length) * 100;
}

function scoreTypeCoverage(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const matching = commits.filter(commit => {
    const parsed = parseConventionalHeader(commit.msg);
    return parsed.type ? CONVENTIONAL_TYPES.has(parsed.type) : false;
  }).length;
  return (matching / commits.length) * 100;
}

function scoreScopeCoverage(commits: Commit[]) {
  const conventional = commits.filter(commit => hasConventionalHeader(commit.msg));
  if (conventional.length === 0) return 0;
  const scoped = conventional.filter(commit => {
    const scope = parseConventionalHeader(commit.msg).scope?.trim().toLowerCase();
    return Boolean(scope && !GENERIC_SCOPES.has(scope));
  }).length;
  return (scoped / conventional.length) * 100;
}

function scoreSubjectStyle(commits: Commit[]) {
  if (commits.length === 0) return 0;
  const styled = commits.filter(commit => hasGoodSubjectStyle(commit.msg, commit.fullMessage)).length;
  return (styled / commits.length) * 100;
}

function scoreFooterSignals(commits: Commit[], workItems: WorkItem[]) {
  const commitSignals = commits.filter(commit => hasFooterSignal(commit.fullMessage)).length;
  const workItemSignals = workItems.filter(item => hasFooterSignal(item.bodyText || '')).length;
  const commitScore = commits.length > 0 ? commitSignals / commits.length : 0;
  const workItemScore = workItems.length > 0 ? workItemSignals / workItems.length : 0;
  if (commits.length === 0 && workItems.length === 0) return 0;
  if (commits.length === 0) return workItemScore * 100;
  if (workItems.length === 0) return commitScore * 100;
  return ((commitScore * 0.7) + (workItemScore * 0.3)) * 100;
}

function isGoodExplanationBody(body?: string) {
  const trimmed = body?.trim();
  if (!trimmed) return false;
  const paragraphs = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
  const text = trimmed.toLowerCase();
  const hasWhy = /\b(why|because|motivation|reason|context|so that|to avoid|previously)\b/.test(text);
  const hasHow = /\b(how|approach|implementation|instead|now|before|after|changed|change)\b/.test(text);
  const bulletLike = /^\s*[-*]/m.test(trimmed);
  const sentences = trimmed
    .split(/[.!?]\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const longEnough = trimmed.length >= 60;
  const structurallyRich = paragraphs.length >= 2 || bulletLike || sentences.length >= 3;
  return longEnough && (hasWhy || hasHow || structurallyRich);
}

function scoreExplanationDepth(commits: Commit[], workItems: WorkItem[]) {
  const explainedCommits = commits.filter(commit => isGoodExplanationBody(commit.body)).length;
  const explainedWorkItems = workItems.filter(item => isGoodExplanationBody(item.bodyText)).length;
  const commitScore = commits.length > 0 ? explainedCommits / commits.length : 0;
  const prItems = workItems.filter(item => item.kind === 'pull_request');
  const prScore = prItems.length > 0
    ? explainedWorkItems / prItems.length
    : workItems.length > 0
      ? explainedWorkItems / workItems.length
      : 0;
  if (commits.length === 0 && workItems.length === 0) return 0;
  if (prItems.length === 0 && workItems.length === 0) return commitScore * 100;
  if (commits.length === 0) return prScore * 100;
  return ((commitScore * 0.6) + (prScore * 0.4)) * 100;
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


function scorePrCoverage(commits: Commit[], workItems: WorkItem[]) {
  const workItemScore = workItems.length > 0
    ? workItems.filter(item => item.kind === 'pull_request').length / workItems.length
    : 0;
  const commitFooterScore = commits.length > 0
    ? commits.filter(commit => hasPullRequestSignal(commit.fullMessage)).length / commits.length
    : 0;

  if (commits.length === 0 && workItems.length === 0) return 0;
  if (workItems.length === 0) return commitFooterScore * 100;
  if (commits.length === 0) return workItemScore * 100;
  return ((workItemScore * 0.65) + (commitFooterScore * 0.35)) * 100;
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
    return 'Strong semantic signal: history follows clear commit conventions and is easy to interpret.';
  }
  if (score >= 55) {
    return 'Moderate semantic signal: history is usable but commit conventions are only partially consistent.';
  }
  if (weakestKey === 'prCoverage') {
    return 'Weak semantic signal: PR linkage is sparse, making workstreams harder to follow.';
  }
  if (weakestKey === 'pathCoherence') {
    return 'Weak semantic signal: file-path coherence is low across work items.';
  }
  if (weakestKey === 'structuredCommits') {
    return 'Weak semantic signal: commit headers rarely follow a consistent type/scope/subject format.';
  }
  if (weakestKey === 'typeCoverage') {
    return 'Weak semantic signal: commit types are inconsistent or too often unclassified.';
  }
  if (weakestKey === 'scopeCoverage') {
    return 'Weak semantic signal: commits rarely use stable, descriptive scopes.';
  }
  if (weakestKey === 'subjectStyle') {
    return 'Weak semantic signal: commit subjects often break style rules or are hard to scan.';
  }
  if (weakestKey === 'footerSignals') {
    return 'Weak semantic signal: issue-closing and breaking-change footers are mostly absent.';
  }
  if (weakestKey === 'releaseSignals') {
    return 'Weak semantic signal: release markers are missing or inconsistent.';
  }
  if (weakestKey === 'clarity') {
    return 'Weak semantic signal: commit wording is too noisy or generic.';
  }
  if (weakestKey === 'explanationDepth') {
    return 'Weak semantic signal: commit and PR bodies rarely explain motivation or implementation.';
  }
  return 'Weak semantic signal: contributor/workstream continuity is low.';
}

export function calculateHistoryQuality(commits: Commit[], phases: Phase[], workItems: WorkItem[]): HistoryQuality {
  const prCoverage = scorePrCoverage(commits, workItems);
  const pathCoherence = scoreWorkstreamCoherence(phases);
  const structuredCommits = scoreStructuredCommits(commits);
  const typeCoverage = scoreTypeCoverage(commits);
  const scopeCoverage = scoreScopeCoverage(commits);
  const subjectStyle = scoreSubjectStyle(commits);
  const footerSignals = scoreFooterSignals(commits, workItems);
  const releaseSignals = scoreReleaseSignals(workItems, phases);
  const clarity = scoreCommitClarity(commits);
  const explanationDepth = scoreExplanationDepth(commits, workItems);
  const continuity = scoreContributorContinuity(workItems);

  const weightedScore =
    (prCoverage / 100) * WEIGHTS.prCoverage +
    (pathCoherence / 100) * WEIGHTS.pathCoherence +
    (structuredCommits / 100) * WEIGHTS.structuredCommits +
    (typeCoverage / 100) * WEIGHTS.typeCoverage +
    (scopeCoverage / 100) * WEIGHTS.scopeCoverage +
    (subjectStyle / 100) * WEIGHTS.subjectStyle +
    (footerSignals / 100) * WEIGHTS.footerSignals +
    (releaseSignals / 100) * WEIGHTS.releaseSignals +
    (clarity / 100) * WEIGHTS.clarity +
    (explanationDepth / 100) * WEIGHTS.explanationDepth +
    (continuity / 100) * WEIGHTS.continuity;

  const score = Math.round(weightedScore * 100);

  const components: Array<[keyof HistoryQuality, number]> = [
    ['prCoverage', prCoverage],
    ['pathCoherence', pathCoherence],
    ['structuredCommits', structuredCommits],
    ['typeCoverage', typeCoverage],
    ['scopeCoverage', scopeCoverage],
    ['subjectStyle', subjectStyle],
    ['footerSignals', footerSignals],
    ['releaseSignals', releaseSignals],
    ['clarity', clarity],
    ['explanationDepth', explanationDepth],
    ['continuity', continuity]
  ];
  const weakest = components.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'clarity';
  const summary = buildSummary(score, weakest);

  return {
    score,
    prCoverage: Math.round(prCoverage),
    pathCoherence: Math.round(pathCoherence),
    structuredCommits: Math.round(structuredCommits),
    typeCoverage: Math.round(typeCoverage),
    scopeCoverage: Math.round(scopeCoverage),
    subjectStyle: Math.round(subjectStyle),
    footerSignals: Math.round(footerSignals),
    releaseSignals: Math.round(releaseSignals),
    clarity: Math.round(clarity),
    explanationDepth: Math.round(explanationDepth),
    continuity: Math.round(continuity),
    summary
  };
}

function hasConventionalHeader(message: string) {
  const parsed = parseConventionalHeader(message);
  return Boolean(parsed.type && parsed.subject && message.includes(':'));
}

function hasGoodSubjectStyle(subjectLine: string, fullMessage: string) {
  const parsed = parseConventionalHeader(subjectLine);
  const subject = (parsed.subject || subjectLine).trim();
  if (!subject) return false;
  const startsLowercase = /^[a-z0-9]/.test(subject);
  const noTrailingDot = !subject.endsWith('.');
  const concise = subject.length <= 100;
  const wrapped = fullMessage
    .split('\n')
    .filter(line => line.trim().length > 0)
    .every(line => line.length <= 120);
  return startsLowercase && noTrailingDot && concise && wrapped;
}

function hasFooterSignal(text: string) {
  return hasPullRequestSignal(text) || /BREAKING CHANGE:/i.test(text);
}

function hasPullRequestSignal(text: string) {
  return /\b(closes|fixes|resolves)\s+#\d+\b/i.test(text) || /\bpr close\s+#\d+\b/i.test(text);
}
