import type { Commit, Phase, PhaseStatus, WorkItem } from '../types';
import type { PullRequestMeta } from './github';
import { COLORS } from './classify';
import { scoreWorkItemBoundaries, selectBoundaries } from './boundaries';
import { buildPhaseFingerprint } from './phaseFingerprint';
import { buildPhaseName } from './phaseNaming';
import { calculateRoadmapConfidence } from './roadmapConfidence';
import type { RoadmapConfidence } from '../types';
import { buildBoundaryReason, buildPhaseNameReason } from './phaseExplanation';

interface PhaseGroup {
  name: string;
  branch: string;
  items: Commit[];
  workItems?: WorkItem[];
  workItemStart?: number;
  workItemEnd?: number;
  fingerprint?: import('../types').PhaseFingerprint;
  start: string;
  end: string;
}

export function buildPhases(
  commits: Commit[],
  options?: { boundaryHints?: number[]; pathDomains?: Record<string, string>; pullRequests?: Record<string, PullRequestMeta>; workItems?: WorkItem[] }
): {
  phases: Phase[];
  grouping: {
    mode: 'work-items';
    label: 'work-items';
    branchRatio: number;
  };
  roadmapConfidence: RoadmapConfidence;
} {
  console.log('Total commits received:', commits.length);

  const raw = commits.filter(c => c && c.msg && c.date);
  const workItems = options?.workItems ?? [];
  const commitBySha = new Map(raw.map(commit => [commit.sha, commit]));

  let groups: PhaseGroup[] = [];
  let boundarySelection = { boundaries: [] as number[], scores: [] as ReturnType<typeof scoreWorkItemBoundaries>, reasons: {} as Record<number, string> };
  if (workItems.length > 0) {
    const result = segmentWorkItems(workItems, commitBySha);
    groups = mergeWeakGroups(result.groups, result.selection);
    boundarySelection = result.selection;
  } else if (raw.length > 0) {
    groups = [makeGroup(raw)];
  }

  const phaseInputs = groups.map(group => {
    const fingerprint = buildPhaseFingerprint(group.workItems ?? [], group.items);
    group.fingerprint = fingerprint;
    return {
      workItems: group.workItems ?? [],
      commits: group.items,
      fingerprint,
      workItemStart: group.workItemStart ?? 0,
      workItemEnd: group.workItemEnd ?? 0
    };
  });

  const confidenceResult = calculateRoadmapConfidence(phaseInputs, workItems, boundarySelection);

  const now = new Date().getTime();
  // Final conversion to Phase[] with status and color
  const trimmedGroups = groups;
  const offset = 0;
  const boundaryScoreByIndex = new Map(boundarySelection.scores.map(score => [score.index, score]));

  const phases = trimmedGroups.map((g, i) => {
    const isLast = i === groups.length - 1;
    const daysSince = (now - new Date(g.end).getTime()) / 86400000;
    
    let status: PhaseStatus = 'done';
    if (isLast && daysSince < 14) status = 'active';
    else if (daysSince > 90) status = 'abandoned';

    const fingerprint = g.fingerprint ?? buildPhaseFingerprint(g.workItems ?? [], g.items);
    const naming = buildPhaseName(fingerprint, g.items);
    const roadmapConfidence = confidenceResult.perPhase[i + offset];
    const boundaryIndex = g.workItemStart ?? 0;
    const boundaryScore = boundaryIndex > 0 ? boundaryScoreByIndex.get(boundaryIndex) : undefined;
    const nameReason = buildPhaseNameReason(fingerprint, naming.source);
    const boundaryReason = buildBoundaryReason(boundaryScore, boundaryIndex === 0);

    return {
      ...g,
      name: naming.name,
      nameSource: naming.source,
      nameReason,
      boundaryReason,
      fingerprint,
      roadmapConfidence,
      status,
      color: COLORS[i % COLORS.length],
      idx: i
    };
  });

  return {
    phases,
    grouping: {
      mode: 'work-items',
      label: 'work-items',
      branchRatio: 0
    },
    roadmapConfidence: confidenceResult.overall
  };
}

function segmentWorkItems(
  workItems: WorkItem[],
  commitBySha: Map<string, Commit>
) {
  const scores = scoreWorkItemBoundaries(workItems);
  const selection = selectBoundaries(workItems, scores, {
    minGap: 3,
    minScore: 0.9,
    minPhaseSize: 3,
    maxPhaseSize: 16
  });
  const boundaries = selection.boundaries;

  const groups: PhaseGroup[] = [];
  let start = 0;
  const ordered = boundaries.slice().sort((a, b) => a - b);
  ordered.forEach(boundary => {
    const slice = workItems.slice(start, boundary);
    if (slice.length > 0) {
      const commits = collectCommits(slice, commitBySha);
      if (commits.length > 0) groups.push(makeGroup(commits, slice, start, boundary));
    }
    start = boundary;
  });
  const tail = workItems.slice(start);
  if (tail.length > 0) {
    const commits = collectCommits(tail, commitBySha);
    if (commits.length > 0) groups.push(makeGroup(commits, tail, start, workItems.length));
  }

  return { groups, selection };
}

function mergeWeakGroups(groups: PhaseGroup[], selection: ReturnType<typeof selectBoundaries>) {
  if (groups.length <= 1) return groups;
  const boundaryScoreByIndex = new Map(selection.scores.map(score => [score.index, score.score]));
  const scoreForBoundary = (index?: number) => (index ? boundaryScoreByIndex.get(index) ?? 0 : 0);

  let i = 0;
  while (i < groups.length) {
    const current = groups[i];
    const fingerprint = buildPhaseFingerprint(current.workItems ?? [], current.items);
    const naming = buildPhaseName(fingerprint, current.items);
    const strength = phaseStrengthScore(fingerprint, naming.source);
    const weak = isWeakPhase(current, fingerprint, naming.source, strength);

    if (!weak || groups.length === 1) {
      i += 1;
      continue;
    }

    const prev = i > 0 ? groups[i - 1] : null;
    const next = i < groups.length - 1 ? groups[i + 1] : null;

    if (!prev && next) {
      groups[i + 1] = mergeGroups(current, next);
      groups.splice(i, 1);
      continue;
    }
    if (prev && !next) {
      groups[i - 1] = mergeGroups(prev, current);
      groups.splice(i, 1);
      i = Math.max(i - 1, 0);
      continue;
    }
    if (prev && next) {
      const beforeScore = scoreForBoundary(current.workItemStart);
      const afterScore = scoreForBoundary(current.workItemEnd);
      let mergeIntoPrev = beforeScore < afterScore;
      if (beforeScore === afterScore) {
        const prevFingerprint = buildPhaseFingerprint(prev.workItems ?? [], prev.items);
        const nextFingerprint = buildPhaseFingerprint(next.workItems ?? [], next.items);
        const prevStrength = phaseStrengthScore(prevFingerprint, buildPhaseName(prevFingerprint, prev.items).source);
        const nextStrength = phaseStrengthScore(nextFingerprint, buildPhaseName(nextFingerprint, next.items).source);
        mergeIntoPrev = prevStrength >= nextStrength;
      }

      if (mergeIntoPrev) {
        groups[i - 1] = mergeGroups(prev, current);
        groups.splice(i, 1);
        i = Math.max(i - 1, 0);
      } else {
        groups[i + 1] = mergeGroups(current, next);
        groups.splice(i, 1);
      }
      continue;
    }

    i += 1;
  }

  return groups;
}

function mergeGroups(left: PhaseGroup, right: PhaseGroup): PhaseGroup {
  return {
    ...left,
    items: [...left.items, ...right.items],
    start: left.start,
    end: right.end,
    branch: left.branch || right.branch,
    workItems: left.workItems && right.workItems
      ? [...left.workItems, ...right.workItems]
      : left.workItems ?? right.workItems,
    workItemStart: left.workItemStart ?? right.workItemStart,
    workItemEnd: right.workItemEnd ?? left.workItemEnd
  };
}

const GENERIC_LABELS = new Set(['feat', 'fix', 'chore', 'docs', 'ci', 'test', 'tests', 'refactor', 'build', 'style', 'perf']);

function isGenericLabel(value?: string) {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  if (normalized.includes('(')) return false;
  return GENERIC_LABELS.has(normalized);
}

function phaseStrengthScore(fingerprint: import('../types').PhaseFingerprint, nameSource: import('../types').PhaseNameSource) {
  let score = 0;
  const title = fingerprint.dominantWorkstreamTitles[0];
  const domain = fingerprint.dominantDomains[0];
  const label = fingerprint.dominantLabelsScopes[0];
  const topic = fingerprint.dominantTopics[0];

  if (title && (title.count >= 2 || title.ratio >= 0.6)) score += 2;
  if (domain && domain.count >= 2 && domain.ratio >= 0.5) score += 1.5;
  if (label && !isGenericLabel(label.value) && label.ratio >= 0.55) score += 1.2;
  if (topic && topic.ratio >= 0.55) score += 0.8;
  if (fingerprint.releaseFlags.length > 0) score += 1.2;
  if (nameSource === 'fallback') score -= 0.4;
  if (nameSource === 'label-scope' && isGenericLabel(label?.value)) score -= 0.4;

  return score + fingerprint.namingConfidence;
}

function isWeakPhase(
  group: PhaseGroup,
  fingerprint: import('../types').PhaseFingerprint,
  nameSource: import('../types').PhaseNameSource,
  strengthScore: number
) {
  const workItemCount = group.workItems?.length ?? 0;
  const dominantLabel = fingerprint.dominantLabelsScopes[0]?.value;
  const genericLabel = isGenericLabel(dominantLabel);
  const lowSignal = fingerprint.namingConfidence < 0.45;
  const tiny = workItemCount <= 3;
  const release = fingerprint.releaseFlags.length > 0;
  const strongIdentity =
    release ||
    (fingerprint.dominantWorkstreamTitles[0]?.ratio ?? 0) >= 0.6 ||
    (fingerprint.dominantDomains[0]?.ratio ?? 0) >= 0.5 ||
    (!genericLabel && (fingerprint.dominantLabelsScopes[0]?.ratio ?? 0) >= 0.6);

  if (strongIdentity) return false;
  if (nameSource === 'fallback') return true;
  if (nameSource === 'label-scope' && genericLabel) return true;
  if (tiny && lowSignal) return true;
  if (strengthScore < 1.2 && workItemCount <= 4) return true;
  return false;
}

function collectCommits(workItems: WorkItem[], commitBySha: Map<string, Commit>) {
  const commits: Commit[] = [];
  workItems.forEach(item => {
    item.commitShas.forEach(sha => {
      const commit = commitBySha.get(sha);
      if (commit) commits.push(commit);
    });
  });
  return commits;
}

function makeGroup(
  commits: Commit[],
  workItems?: WorkItem[],
  workItemStart?: number,
  workItemEnd?: number
): PhaseGroup {
  const start = commits[0].date;
  const end = commits[commits.length - 1].date;
  return {
    name: '',
    items: commits,
    start,
    end,
    branch: commits[0].branch || 'main',
    workItems,
    workItemStart,
    workItemEnd
  };
}
