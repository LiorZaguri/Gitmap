import type { WorkItem } from '../types';

export interface BoundaryScoreComponent {
  value: number;
  weight: number;
  weighted: number;
  detail?: string;
}

export interface BoundaryScore {
  index: number;
  score: number;
  components: Record<string, BoundaryScoreComponent>;
}

export interface BoundarySelection {
  boundaries: number[];
  scores: BoundaryScore[];
  reasons: Record<number, string>;
}

export interface BoundaryWeights {
  pathDomain: number;
  taxonomy: number;
  topic: number;
  release: number;
  contributor: number;
  branch: number;
  timeGap: number;
}

const DEFAULT_WEIGHTS: BoundaryWeights = {
  pathDomain: 1.4,
  taxonomy: 1.1,
  topic: 1.3,
  release: 0.9,
  contributor: 0.7,
  branch: 0.5,
  timeGap: 0.3
};

export function scoreWorkItemBoundaries(workItems: WorkItem[], weights: BoundaryWeights = DEFAULT_WEIGHTS): BoundaryScore[] {
  const scores: BoundaryScore[] = [];
  for (let i = 1; i < workItems.length; i += 1) {
    scores.push(scoreBoundary(workItems[i - 1], workItems[i], i, weights));
  }
  return scores;
}

export function selectBoundaries(
  workItems: WorkItem[],
  scores: BoundaryScore[],
  options?: { minGap?: number; minScore?: number; maxPhaseSize?: number; minPhaseSize?: number }
): BoundarySelection {
  const minGap = Math.max(1, options?.minGap ?? 2);
  const minScore = options?.minScore ?? 0.8;
  const minPhaseSize = Math.max(2, options?.minPhaseSize ?? 2);
  const maxPhaseSize = Math.max(minPhaseSize * 2, options?.maxPhaseSize ?? 14);

  const localMax = scores.filter((s, idx) => {
    const prev = scores[idx - 1];
    const next = scores[idx + 1];
    const isLocal = (!prev || s.score >= prev.score) && (!next || s.score >= next.score);
    return isLocal && s.score >= minScore;
  });

  const picked: number[] = [];
  const reasons: Record<number, string> = {};
  localMax
    .sort((a, b) => b.score - a.score)
    .forEach(candidate => {
      if (picked.some(idx => Math.abs(idx - candidate.index) < minGap)) return;
      picked.push(candidate.index);
      reasons[candidate.index] = 'local-max';
    });

  const sorted = picked.sort((a, b) => a - b);
  const adjusted = splitLargePhases(sorted, scores, workItems.length, maxPhaseSize, minPhaseSize, minScore, reasons);
  const merged = mergeTinyPhases(adjusted, scores, workItems.length, minPhaseSize, minScore, reasons);

  return {
    boundaries: merged,
    scores,
    reasons
  };
}

function scoreBoundary(prev: WorkItem, next: WorkItem, index: number, weights: BoundaryWeights): BoundaryScore {
  const pathShift = setShift(prev.pathDomains, next.pathDomains);
  const taxonomyShift = setShift(
    [...prev.labels, ...prev.typesScopes],
    [...next.labels, ...next.typesScopes]
  );
  const topicShift = 1 - weightedCosine(prev.topicTokens, next.topicTokens);
  const releaseBonus = releaseBoundaryBonus(prev.releaseFlags, next.releaseFlags);
  const contributorShift = setShift(prev.contributors, next.contributors);
  const branchShift = branchBoundaryShift(prev.sourceBranchHint, next.sourceBranchHint);
  const timeGap = timeGapScore(prev.endDate, next.startDate);

  const components: Record<string, BoundaryScoreComponent> = {
    pathDomain: weightedComponent(pathShift, weights.pathDomain),
    taxonomy: weightedComponent(taxonomyShift, weights.taxonomy),
    topic: weightedComponent(topicShift, weights.topic),
    release: weightedComponent(releaseBonus, weights.release),
    contributor: weightedComponent(contributorShift, weights.contributor),
    branch: weightedComponent(branchShift, weights.branch),
    timeGap: weightedComponent(timeGap, weights.timeGap, `${timeGap.toFixed(2)}`)
  };

  const score = Object.values(components).reduce((sum, c) => sum + c.weighted, 0);

  return {
    index,
    score,
    components
  };
}

function weightedComponent(value: number, weight: number, detail?: string): BoundaryScoreComponent {
  const v = clamp01(value);
  return {
    value: v,
    weight,
    weighted: v * weight,
    detail
  };
}

function setShift(a: string[], b: string[]) {
  const aSet = new Set(a.filter(Boolean));
  const bSet = new Set(b.filter(Boolean));
  if (aSet.size === 0 && bSet.size === 0) return 0;
  let overlap = 0;
  aSet.forEach(token => {
    if (bSet.has(token)) overlap += 1;
  });
  const union = new Set([...aSet, ...bSet]).size;
  const similarity = union > 0 ? overlap / union : 0;
  return 1 - similarity;
}

function weightedCosine(a: Array<{ token: string; weight: number }>, b: Array<{ token: string; weight: number }>) {
  const mapA = new Map(a.map(t => [t.token, t.weight]));
  const mapB = new Map(b.map(t => [t.token, t.weight]));
  if (mapA.size === 0 || mapB.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  mapA.forEach((weight, token) => {
    normA += weight * weight;
    const bw = mapB.get(token);
    if (bw) dot += weight * bw;
  });
  mapB.forEach(weight => {
    normB += weight * weight;
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function releaseBoundaryBonus(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const leftHas = leftSet.size > 0;
  const rightHas = rightSet.size > 0;
  if (!leftHas && !rightHas) return 0;
  if (leftHas !== rightHas) return 1;
  return 0.5;
}

function branchBoundaryShift(left?: string, right?: string) {
  if (left && right) return left === right ? 0 : 1;
  if (left || right) return 0.2;
  return 0;
}

function timeGapScore(prevEnd: string, nextStart: string) {
  if (!prevEnd || !nextStart) return 0;
  const gap = Math.abs(new Date(nextStart).getTime() - new Date(prevEnd).getTime());
  const days = gap / 86400000;
  return clamp01(days / 30);
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function splitLargePhases(
  boundaries: number[],
  scores: BoundaryScore[],
  totalItems: number,
  maxPhaseSize: number,
  minPhaseSize: number,
  minScore: number,
  reasons: Record<number, string>
) {
  const result = [...boundaries];
  const withEdges = [0, ...result, totalItems];
  for (let i = 1; i < withEdges.length; i += 1) {
    const start = withEdges[i - 1];
    const end = withEdges[i];
    const span = end - start;
    if (span <= maxPhaseSize) continue;
    const candidate = bestInternalBoundary(scores, start + minPhaseSize, end - minPhaseSize, minScore);
    if (candidate !== null && !result.includes(candidate)) {
      result.push(candidate);
      reasons[candidate] = 'split-large';
    }
  }
  return result.sort((a, b) => a - b);
}

function mergeTinyPhases(
  boundaries: number[],
  scores: BoundaryScore[],
  totalItems: number,
  minPhaseSize: number,
  minScore: number,
  reasons: Record<number, string>
) {
  const result = [...boundaries];
  let changed = true;
  while (changed) {
    changed = false;
    const withEdges = [0, ...result, totalItems];
    for (let i = 1; i < withEdges.length; i += 1) {
      const start = withEdges[i - 1];
      const end = withEdges[i];
      const span = end - start;
      if (span >= minPhaseSize) continue;
      const boundaryToRemove = boundaryToRemoveForTiny(result, start, end, scores, minScore);
      if (boundaryToRemove !== null) {
        const idx = result.indexOf(boundaryToRemove);
        if (idx >= 0) {
          result.splice(idx, 1);
          reasons[boundaryToRemove] = 'merge-tiny';
          changed = true;
          break;
        }
      }
    }
  }
  return result;
}

function boundaryToRemoveForTiny(
  boundaries: number[],
  start: number,
  end: number,
  scores: BoundaryScore[],
  minScore: number
) {
  const candidates = [start, end].filter(idx => boundaries.includes(idx));
  if (candidates.length === 0) return null;
  let weakest = candidates[0];
  let weakestScore = scoreForBoundary(weakest, scores);
  candidates.slice(1).forEach(idx => {
    const score = scoreForBoundary(idx, scores);
    if (score < weakestScore) {
      weakest = idx;
      weakestScore = score;
    }
  });
  if (weakestScore >= minScore) return null;
  return weakest;
}

function bestInternalBoundary(scores: BoundaryScore[], start: number, end: number, minScore: number) {
  let best: BoundaryScore | null = null;
  scores.forEach(score => {
    if (score.index <= start || score.index >= end) return;
    if (!best || score.score > best.score) best = score;
  });
  if (!best || best.score < minScore) return null;
  return best.index;
}

function scoreForBoundary(index: number, scores: BoundaryScore[]) {
  return scores.find(score => score.index === index)?.score ?? 0;
}
