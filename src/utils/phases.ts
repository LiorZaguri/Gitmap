import type { Commit, Phase, PhaseStatus, WorkItem } from '../types';
import type { PullRequestMeta } from './github';
import { COLORS, STOP_WORDS, toTitleCase } from './classify';
import { scoreWorkItemBoundaries, selectBoundaries } from './boundaries';
import { buildPhaseFingerprint } from './phaseFingerprint';
import { buildPhaseName } from './phaseNaming';
import { calculateRoadmapConfidence } from './roadmapConfidence';
import type { RoadmapConfidence } from '../types';

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

const DOMAIN_MAP = [
  { re: /dsl|compiler|lexer|parser|ast|token/i, name: 'DSL Compiler' },
  { re: /auth|login|session|jwt|oauth|signup/i, name: 'Authentication' },
  { re: /ui|component|design|style|css|layout/i, name: 'UI Components' },
  { re: /api|endpoint|route|server|express/i, name: 'API Layer' },
  { re: /database|schema|migration|postgres|sql/i, name: 'Database' },
  { re: /test|spec|coverage|jest|vitest/i, name: 'Testing' },
  { re: /deploy|ci|docker|infra|pipeline|action/i, name: 'Infrastructure' },
  { re: /release|version|changelog|tag/i, name: 'Release' },
  { re: /kpi|metric|chart|graph|visual|dashboard/i, name: 'Data Visualization' },
  { re: /runtime|render|host|widget|tool/i, name: 'Runtime Engine' },
  { re: /generation|llm|ai|prompt|model/i, name: 'AI Generation' },
  { re: /init|setup|scaffold|bootstrap|initial/i, name: 'Project Setup' },
  { re: /permission|role|access|security/i, name: 'Permissions' },
  { re: /mobile|native|pwa|ios|android/i, name: 'Mobile' },
  { re: /rich|component|kpi|banner|tabs/i, name: 'Rich Components' },
  { re: /i18n|locale|translat|language/i, name: 'Internationalization' },
  { re: /performance|optim|cache|speed/i, name: 'Performance' },
];

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
  const pathDomains = options?.pathDomains || {};
  const pullRequests = options?.pullRequests || {};
  const context = { pathDomains, pullRequests };
  const commitBySha = new Map(raw.map(commit => [commit.sha, commit]));

  let groups: PhaseGroup[] = [];
  let boundarySelection = { boundaries: [] as number[], scores: [] as ReturnType<typeof scoreWorkItemBoundaries>, reasons: {} as Record<number, string> };
  if (workItems.length > 0) {
    const result = segmentWorkItems(workItems, commitBySha, context);
    groups = result.groups;
    boundarySelection = result.selection;
  } else if (raw.length > 0) {
    groups = [makeGroup(raw, context)];
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
  const phases = trimmedGroups.map((g, i) => {
    const isLast = i === Math.min(groups.length, 14) - 1;
    const daysSince = (now - new Date(g.end).getTime()) / 86400000;
    
    let status: PhaseStatus = 'done';
    if (isLast && daysSince < 14) status = 'active';
    else if (daysSince > 90) status = 'abandoned';

    const fingerprint = g.fingerprint ?? buildPhaseFingerprint(g.workItems ?? [], g.items);
    const naming = buildPhaseName(fingerprint, g.items);
    const roadmapConfidence = confidenceResult.perPhase[i + offset];

    return {
      ...g,
      name: naming.name,
      nameSource: naming.source,
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
  commitBySha: Map<string, Commit>,
  context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }
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
      if (commits.length > 0) groups.push(makeGroup(commits, context, slice, start, boundary));
    }
    start = boundary;
  });
  const tail = workItems.slice(start);
  if (tail.length > 0) {
    const commits = collectCommits(tail, commitBySha);
    if (commits.length > 0) groups.push(makeGroup(commits, context, tail, start, workItems.length));
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

function groupByBranch(commits: Commit[], context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }) {
  const groups: PhaseGroup[] = [];
  let curCommitGroup: Commit[] = [];
  let curBranch = '';

  commits.forEach(c => {
    if (c.branch !== curBranch) {
      if (curCommitGroup.length) {
        groups.push({
          name: nameFromBranch(curBranch, curCommitGroup, context),
          branch: curBranch,
          items: [...curCommitGroup],
          start: curCommitGroup[0].date,
          end: curCommitGroup[curCommitGroup.length - 1].date
        });
      }
      curBranch = c.branch;
      curCommitGroup = [c];
    } else {
      curCommitGroup.push(c);
    }
  });

  if (curCommitGroup.length) {
    groups.push({
      name: nameFromBranch(curBranch, curCommitGroup, context),
      branch: curBranch,
      items: curCommitGroup,
      start: curCommitGroup[0].date,
      end: curCommitGroup[curCommitGroup.length - 1].date
    });
  }
  return groups;
}

function nameFromBranch(branch: string, commits: Commit[], context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }): string {
  if (!branch || branch === 'main' || branch === 'master' || branch === 'HEAD') {
    return nameFromCommits(commits, context);
  }

  const baseName = branch
    .replace(/^(feat|fix|feature|hotfix|chore|release|dev)\//i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const normalized = baseName.toLowerCase();
  const tooGeneric = !normalized || ['main', 'master', 'dev', 'release', 'feature', 'fix', 'chore'].includes(normalized);
  if (tooGeneric) {
    return nameFromCommits(commits, context);
  }

  // (Word frequency logic included as requested, even if only Returning baseName)
  const words = commits
    .flatMap(c => c.msg.toLowerCase().split(/[\s():/-]+/))
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const freq: Record<string, number> = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  // const topWord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];

  return toTitleCase(baseName);
}


function normalizeAuthor(author: string) {
  return author
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeBranch(branch: string) {
  if (!branch || ['main', 'master', 'HEAD'].includes(branch)) return null;
  const baseName = branch
    .replace(/^(feat|fix|feature|hotfix|chore|release|dev)\//i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  const normalized = baseName.toLowerCase();
  const tooGeneric = !normalized || ['main', 'master', 'dev', 'release', 'feature', 'fix', 'chore'].includes(normalized);
  return tooGeneric ? null : normalized;
}

function normalizeTitle(title: string) {
  return title
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^(feat|fix|chore|docs|refactor|test|build|ci)\s*[:/]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addFeature(map: Record<string, number>, key: string | null, weight = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + weight;
}

function tokenizeMessage(msg: string) {
  return msg
    .toLowerCase()
    .split(/[\s():/.-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function dominantDomainFromFiles(files?: string[]) {
  if (!files || files.length === 0) return null;
  const counts: Record<string, number> = {};
  files.forEach(file => {
    const top = file.split('/')[0] || '(root)';
    counts[top] = (counts[top] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top) return null;
  const second = sorted[1]?.[1] || 0;
  const ratio = top[1] / files.length;
  if (top[0] === '(root)') return null;
  if (ratio >= 0.5 || top[1] >= second + 3) {
    return top[0].replace(/[-_]/g, ' ').trim();
  }
  return null;
}

function buildFingerprint(
  commits: Commit[],
  pathDomains: Record<string, string>,
  pullRequests: Record<string, PullRequestMeta>
) {
  const counts: Record<string, number> = {};
  commits.forEach(commit => {
    const msg = commit.msg || '';
    const msgLower = msg.toLowerCase();

    const scopeMatch = msg.match(/\w+\(([^)]+)\):/);
    const scope = scopeMatch?.[1]?.trim().toLowerCase();
    addFeature(counts, scope ? `scope:${scope}` : null, 2);

    tokenizeMessage(msg).forEach(token => addFeature(counts, `msg:${token}`, 1));

    const domain = DOMAIN_MAP.find(d => d.re.test(msgLower));
    addFeature(counts, domain ? `domain:${domain.name.toLowerCase()}` : null, 3);

    const pathDomain = pathDomains[commit.sha];
    addFeature(counts, pathDomain ? `path:${pathDomain.toLowerCase()}` : null, 4);

    const branch = normalizeBranch(commit.branch);
    addFeature(counts, branch ? `branch:${branch}` : null, 2);

    const author = normalizeAuthor(commit.author || '');
    addFeature(counts, author ? `author:${author}` : null, 1);

    const pr = pullRequests[commit.sha];
    if (pr?.title) {
      tokenizeMessage(pr.title).forEach(token => addFeature(counts, `pr:${token}`, 2));
    }
    if (pr?.body) {
      tokenizeMessage(pr.body).forEach(token => addFeature(counts, `prbody:${token}`, 1));
    }
    if (pr?.files && pr.files.length > 0) {
      const domain = dominantDomainFromFiles(pr.files);
      if (domain) addFeature(counts, `prpath:${domain.toLowerCase()}`, 3);
    }

    if (/^merge\b/i.test(msgLower)) addFeature(counts, 'hint:merge', 3);
    if (/release|version|changelog|tag/i.test(msgLower)) addFeature(counts, 'hint:release', 3);

    if (commit.type) addFeature(counts, `type:${commit.type}`, 1);
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

function detectSimilarityBoundaries(
  slice: Commit[],
  boundaryHints: number[],
  pathDomains: Record<string, string>,
  pullRequests: Record<string, PullRequestMeta>,
  indexBySha: Map<string, number>
) {
  const n = slice.length;
  const minWindow = 6;
  const maxWindow = 14;
  const window = Math.min(maxWindow, Math.max(minWindow, Math.round(n / 12)));
  if (n < window * 2 + 4) return [];

  const hintSet = new Set(boundaryHints);
  const sims: Array<{ i: number; sim: number; hint: boolean; gap: number; merge: boolean; release: boolean; prHint: boolean }> = [];
  const gaps: number[] = [];

  for (let i = 1; i < n; i++) {
    const gap = Math.abs(new Date(slice[i].date).getTime() - new Date(slice[i - 1].date).getTime()) / 86400000;
    gaps.push(gap);
  }
  const gapThreshold = Math.max(5, percentile(gaps, 0.9));

  for (let i = window; i <= n - window; i++) {
    const prev = slice.slice(i - window, i);
    const next = slice.slice(i, i + window);
    const sim = cosineSimilarity(
      buildFingerprint(prev, pathDomains, pullRequests),
      buildFingerprint(next, pathDomains, pullRequests)
    );
    const globalIdx = indexBySha.get(slice[i].sha);
    const hint = globalIdx !== undefined && hintSet.has(globalIdx);
    const gap = Math.abs(new Date(slice[i].date).getTime() - new Date(slice[i - 1].date).getTime()) / 86400000;
    const msg = slice[i].msg.toLowerCase();
    const merge = msg.startsWith('merge');
    const release = /release|version|changelog|tag/i.test(msg);
    const prHint = Boolean(pullRequests[slice[i].sha]);
    sims.push({ i, sim, hint, gap, merge, release, prHint });
  }

  if (sims.length === 0) return [];
  const simValues = sims.map(s => s.sim);
  const low = percentile(simValues, 0.2);
  const mid = percentile(simValues, 0.4);
  const minSeg = Math.max(8, Math.floor(window * 1.5));

  const boundaries: number[] = [];
  let last = 0;
  for (const s of sims) {
    const hintish = s.hint || s.merge || s.release || s.prHint || s.gap >= gapThreshold;
    const lowDrop = s.sim <= low;
    const midDrop = s.sim <= mid;
    if ((lowDrop || (hintish && midDrop)) && s.i - last >= minSeg && n - s.i >= minSeg) {
      boundaries.push(s.i);
      last = s.i;
    }
  }

  return boundaries;
}

function domainNameFromCommits(commits: Commit[]) {
  const text = commits.map(c => c.msg).join(' ').toLowerCase();
  const matches = DOMAIN_MAP
    .map(d => {
      const count = (text.match(new RegExp(d.re.source, 'g')) || []).length;
      return { name: d.name, count };
    })
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count);

  if (matches.length === 0) return null;
  const top = matches[0];
  const second = matches[1]?.count || 0;
  if (top.count >= 2 && top.count >= second + 1) return top.name;
  return null;
}

function dominantPrTitle(commits: Commit[], pullRequests: Record<string, PullRequestMeta>) {
  const titles = commits
    .map(c => pullRequests[c.sha]?.title)
    .filter((t): t is string => Boolean(t));
  if (titles.length === 0) return null;

  const counts: Record<string, { count: number; original: string }> = {};
  titles.forEach(title => {
    const cleaned = normalizeTitle(title);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (!counts[key]) counts[key] = { count: 0, original: cleaned };
    counts[key].count += 1;
    if (cleaned.length > counts[key].original.length) counts[key].original = cleaned;
  });

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
  const top = sorted[0];
  if (!top) return null;
  const ratio = top.count / titles.length;
  if (top.count >= 2 || ratio >= 0.55 || titles.length <= 2) {
    return top.original;
  }
  return null;
}

function dominantPathDomainFromCommits(
  commits: Commit[],
  pathDomains: Record<string, string>,
  pullRequests: Record<string, PullRequestMeta>
) {
  const counts: Record<string, number> = {};
  commits.forEach(commit => {
    const pathDomain = pathDomains[commit.sha];
    if (pathDomain) counts[pathDomain] = (counts[pathDomain] || 0) + 1;
    const pr = pullRequests[commit.sha];
    const prDomain = dominantDomainFromFiles(pr?.files);
    if (prDomain) counts[prDomain] = (counts[prDomain] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top) return null;
  const second = sorted[1]?.[1] || 0;
  if (top[1] >= 3 && (top[1] >= second + 2 || top[1] / commits.length >= 0.4)) {
    return toTitleCase(top[0]);
  }
  return null;
}

function refineGroupsBySemanticSignals(
  commits: Commit[],
  groups: PhaseGroup[],
  boundaryHints: number[],
  pathDomains: Record<string, string>,
  pullRequests: Record<string, PullRequestMeta>
) {
  if (groups.length === 0) return groups;
  const indexBySha = new Map(commits.map((c, idx) => [c.sha, idx]));

  const refined: PhaseGroup[] = [];
  groups.forEach(group => {
    if (group.items.length < 24) {
      refined.push(group);
      return;
    }
    const slice = group.items;
    const boundaries = detectSimilarityBoundaries(slice, boundaryHints, pathDomains, pullRequests, indexBySha);
    if (boundaries.length === 0) {
      refined.push(group);
      return;
    }

    let start = 0;
    for (const idx of boundaries) {
      const seg = slice.slice(start, idx);
      if (seg.length) refined.push(makeGroup(seg, { pathDomains, pullRequests }));
      start = idx;
    }

    const tail = slice.slice(start);
    if (tail.length) refined.push(makeGroup(tail, { pathDomains, pullRequests }));
  });

  return mergeAdjacentSameName(mergeSmallGroups(refined, 8, { pathDomains, pullRequests }), { pathDomains, pullRequests });
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}


function mergeSmallGroups(
  groups: PhaseGroup[],
  minSize: number,
  context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }
) {
  if (groups.length <= 1) return groups;
  const merged: PhaseGroup[] = [];
  for (const group of groups) {
    if (group.items.length < minSize && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.items.push(...group.items);
      prev.end = group.end;
      prev.name = nameFromCommits(prev.items, context);
      prev.branch = prev.branch || group.branch;
    } else {
      merged.push(group);
    }
  }

  if (merged.length > 1 && merged[0].items.length < minSize) {
    const first = merged.shift();
    if (first) {
      merged[0].items = [...first.items, ...merged[0].items];
      merged[0].start = first.start;
      merged[0].name = nameFromCommits(merged[0].items, context);
    }
  }

  return merged;
}

function mergeAdjacentSameName(
  groups: PhaseGroup[],
  context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }
) {
  if (groups.length <= 1) return groups;
  const merged: PhaseGroup[] = [groups[0]];
  for (let i = 1; i < groups.length; i++) {
    const prev = merged[merged.length - 1];
    const next = groups[i];
    if (prev.name === next.name) {
      prev.items.push(...next.items);
      prev.end = next.end;
      prev.name = nameFromCommits(prev.items, context);
      prev.branch = prev.branch || next.branch;
    } else {
      merged.push(next);
    }
  }
  return merged;
}


function makeGroup(
  commits: Commit[],
  context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> },
  workItems?: WorkItem[],
  workItemStart?: number,
  workItemEnd?: number
): PhaseGroup {
  const start = commits[0].date;
  const end = commits[commits.length - 1].date;
  return {
    name: nameFromCommits(commits, context),
    items: commits,
    start,
    end,
    branch: commits[0].branch || 'main',
    workItems,
    workItemStart,
    workItemEnd
  };
}

function nameFromCommits(
  commits: Commit[],
  context: { pathDomains: Record<string, string>; pullRequests: Record<string, PullRequestMeta> }
): string {
  // Filter out merge commits — they add noise not signal
  const meaningful = commits.filter(c =>
    !c.msg.toLowerCase().startsWith('merge') &&
    !c.msg.toLowerCase().startsWith('revert') &&
    !c.msg.toLowerCase().startsWith('bump')
  );

  // If all commits are merge commits/noise, use all commits as source
  const source = meaningful.length > 0 ? meaningful : commits;

  const prTitle = dominantPrTitle(source, context.pullRequests);
  if (prTitle) return prTitle;

  const dominantDomain = dominantPathDomainFromCommits(source, context.pathDomains, context.pullRequests);
  if (dominantDomain) return dominantDomain;

  const msgDomain = domainNameFromCommits(source);
  if (msgDomain) return msgDomain;

  const words = source
    .flatMap(c => {
      const scopeMatch = c.msg.match(/\w+\((\w+)\):/);
      const scope = scopeMatch ? [scopeMatch[1]] : [];
      return [...scope, ...c.msg.toLowerCase().split(/[\s():/-]+/)];
    })
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));


  const freq: Record<string, number> = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const topWord = sorted[0]?.[0];
  const secondWord = sorted[1]?.[0];

  if (!topWord) {
    const month = new Date(commits[0].date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return `Work · ${month}`;
  }

  const name = secondWord && freq[secondWord] > 1
    ? `${topWord} ${secondWord}`
    : topWord;

  return toTitleCase(name);
}
