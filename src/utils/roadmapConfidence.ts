import type { Commit, PhaseFingerprint, RoadmapConfidence, WorkItem } from '../types';
import type { BoundarySelection } from './boundaries';

const WEIGHTS = {
  prCoverage: 0.22,
  pathCoherence: 0.24,
  boundaryStrength: 0.24,
  namingClarity: 0.2,
  releaseStructure: 0.1
};

export interface PhaseConfidenceInput {
  workItems: WorkItem[];
  commits: Commit[];
  fingerprint: PhaseFingerprint;
  workItemStart: number;
  workItemEnd: number;
}

export interface RoadmapConfidenceResult {
  overall: RoadmapConfidence;
  perPhase: RoadmapConfidence[];
}

export function calculateRoadmapConfidence(
  phases: PhaseConfidenceInput[],
  allWorkItems: WorkItem[],
  selection: BoundarySelection
): RoadmapConfidenceResult {
  const boundaryMargins = selection.boundaries.map(index => marginForBoundary(index, selection));
  const overallBoundary = average(boundaryMargins) * 100;
  const overallPrCoverage = ratio(allWorkItems.filter(item => item.kind === 'pull_request').length, allWorkItems.length) * 100;
  const overallRelease = ratio(allWorkItems.filter(item => item.releaseFlags.length > 0).length, allWorkItems.length) * 100;

  const phaseConfidences = phases.map(phase => buildPhaseConfidence(phase, selection, allWorkItems.length));

  const overallPath = weightedAverage(phases.map((phase, idx) => ({
    value: phaseConfidences[idx].pathCoherence,
    weight: Math.max(phase.commits.length, 1)
  })));
  const overallNaming = weightedAverage(phases.map((phase, idx) => ({
    value: phaseConfidences[idx].namingClarity,
    weight: Math.max(phase.commits.length, 1)
  })));

  const overall = buildScore({
    prCoverage: overallPrCoverage,
    pathCoherence: overallPath,
    boundaryStrength: overallBoundary,
    namingClarity: overallNaming,
    releaseStructure: overallRelease
  });

  return {
    overall,
    perPhase: phaseConfidences
  };
}

function buildPhaseConfidence(
  phase: PhaseConfidenceInput,
  selection: BoundarySelection,
  totalWorkItems: number
): RoadmapConfidence {
  const prCoverage = ratio(phase.workItems.filter(item => item.kind === 'pull_request').length, phase.workItems.length) * 100;
  const pathCoherence = (phase.fingerprint.dominantDomains[0]?.ratio ?? 0) * 100;
  const namingClarity = phase.fingerprint.namingConfidence * 100;
  const releaseStructure = phase.fingerprint.releaseFlags.length > 0 ? 100 : 0;

  const boundaryStrength = phaseBoundaryStrength(phase, selection, totalWorkItems) * 100;

  return buildScore({
    prCoverage,
    pathCoherence,
    boundaryStrength,
    namingClarity,
    releaseStructure
  });
}

function buildScore(components: Omit<RoadmapConfidence, 'score'>): RoadmapConfidence {
  const score = clamp01(
    (components.prCoverage / 100) * WEIGHTS.prCoverage +
    (components.pathCoherence / 100) * WEIGHTS.pathCoherence +
    (components.boundaryStrength / 100) * WEIGHTS.boundaryStrength +
    (components.namingClarity / 100) * WEIGHTS.namingClarity +
    (components.releaseStructure / 100) * WEIGHTS.releaseStructure
  ) * 100;

  return {
    ...components,
    score: Math.round(score)
  };
}

function phaseBoundaryStrength(
  phase: PhaseConfidenceInput,
  selection: BoundarySelection,
  totalWorkItems: number
) {
  const boundaries: number[] = [];
  if (phase.workItemStart > 0) boundaries.push(phase.workItemStart);
  if (phase.workItemEnd < totalWorkItems) boundaries.push(phase.workItemEnd);
  const selected = boundaries.filter(boundary => selection.boundaries.includes(boundary));
  if (selected.length === 0) return 0;
  const margins = selected.map(index => marginForBoundary(index, selection));
  return average(margins);
}

function marginForBoundary(index: number, selection: BoundarySelection) {
  const scores = selection.scores;
  if (scores.length === 0) return 0;
  const current = scoreFor(index, scores);
  const prev = scoreFor(index - 1, scores);
  const next = scoreFor(index + 1, scores);
  const neighbor = Math.max(prev, next);
  const maxScore = Math.max(...scores.map(score => score.score), 1);
  const margin = Math.max(0, current - neighbor);
  return clamp01(margin / maxScore);
}

function scoreFor(index: number, scores: BoundarySelection['scores']) {
  return scores.find(score => score.index === index)?.score ?? 0;
}

function ratio(part: number, total: number) {
  if (!total) return 0;
  return part / total;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
