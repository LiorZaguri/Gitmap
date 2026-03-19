import type { Commit, Phase } from '../types';
import { STOP_WORDS } from './classify';

type HistoryQuality = {
  score: number;
  clarity: number;
  coherence: number;
  boundaries: number;
  naming: number;
  summary: string;
};

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
  return Math.round((clear / commits.length) * 100);
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
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.round(avg * 100);
}

function scoreBoundaryStrength(phases: Phase[]) {
  if (phases.length <= 1) return 0;
  const sims: number[] = [];
  for (let i = 1; i < phases.length; i++) {
    const prev = buildTokenCounts(phases[i - 1].items);
    const next = buildTokenCounts(phases[i].items);
    sims.push(cosineSimilarity(prev, next));
  }
  const avgSim = sims.reduce((a, b) => a + b, 0) / sims.length;
  const strength = Math.max(0, Math.min(1, 1 - avgSim));
  return Math.round(strength * 100);
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
  return Math.round(avg * uniqueRatio * 100);
}

function buildSummary(score: number, clarity: number, coherence: number, boundaries: number, naming: number) {
  if (score >= 75) {
    return 'Strong semantic signal: commit messages are clear, phases are coherent, and boundaries read distinctly.';
  }
  if (score >= 55) {
    return 'Moderate semantic signal: some phases are distinct, but naming or boundaries could be clearer.';
  }
  const weakest = Math.min(clarity, coherence, boundaries, naming);
  if (weakest === clarity) {
    return 'Weak semantic signal: commit messages are too generic for clear phase interpretation.';
  }
  if (weakest === boundaries) {
    return 'Weak semantic signal: boundaries between phases are blurry, so the roadmap can feel fuzzy.';
  }
  if (weakest === naming) {
    return 'Weak semantic signal: phase names are too generic or repetitive.';
  }
  return 'Weak semantic signal: phase themes are not cohesive enough for a clear roadmap.';
}

export function calculateHistoryQuality(commits: Commit[], phases: Phase[]): HistoryQuality {
  const clarity = scoreCommitClarity(commits);
  const coherence = scoreWorkstreamCoherence(phases);
  const boundaries = scoreBoundaryStrength(phases);
  const naming = scoreNamingConfidence(phases);
  const score = Math.round(clarity * 0.25 + coherence * 0.3 + boundaries * 0.25 + naming * 0.2);
  const summary = buildSummary(score, clarity, coherence, boundaries, naming);
  return {
    score,
    clarity,
    coherence,
    boundaries,
    naming,
    summary
  };
}
