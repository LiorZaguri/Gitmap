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
