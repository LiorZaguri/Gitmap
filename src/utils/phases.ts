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
    groups = result.groups;
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
  const trimmedGroups = groups.slice(-14);
  const offset = Math.max(groups.length - trimmedGroups.length, 0);
  const boundaryScoreByIndex = new Map(boundarySelection.scores.map(score => [score.index, score]));

  const phases = trimmedGroups.map((g, i) => {
    const isLast = i === Math.min(groups.length, 14) - 1;
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
    minGap: 2,
    minScore: 0.85,
    minPhaseSize: 2,
    maxPhaseSize: 14
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
