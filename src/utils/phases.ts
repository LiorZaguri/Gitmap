import type { Commit, Phase, PhaseStatus } from '../types';
import { COLORS, STOP_WORDS, toTitleCase } from './classify';

interface PhaseGroup {
  name: string;
  branch: string;
  items: Commit[];
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
  options?: { boundaryHints?: number[]; pathDomains?: Record<string, string> }
): {
  phases: Phase[];
  grouping: {
    mode: 'branch' | 'time-gap';
    label: 'branch' | 'time-gap' | 'mixed';
    branchRatio: number;
  };
} {
  console.log('Total commits received:', commits.length);
  console.log('Branch distribution:', commits.reduce((acc, c) => {
    acc[c.branch] = (acc[c.branch] || 0) + 1;
    return acc;
  }, {} as Record<string, number>));

  // commits are already Commit objects — no conversion needed
  const raw = commits.filter(c => c && c.msg && c.date);

  const branchCommits = raw.filter(c =>
    c.branch && c.branch !== 'main' && c.branch !== 'master' && c.branch !== 'HEAD'
  );
  const branchRatio = branchCommits.length / Math.max(raw.length, 1);
  console.log('Branch ratio:', branchRatio, '— using', branchRatio > 0.2 ? 'branch' : 'time-gap', 'grouping');

  let groups: PhaseGroup[] = [];
  if (branchRatio > 0.2) {
    groups = groupByBranch(raw);
  } else {
    groups = groupByTimeGaps(raw);
  }

  const boundaryHints = options?.boundaryHints || [];
  const pathDomains = options?.pathDomains || {};
  groups = refineGroupsBySemanticSignals(raw, groups, boundaryHints, pathDomains);
  groups = applyFallbackGrouping(raw, groups, boundaryHints, pathDomains);

  const now = new Date().getTime();
  // Final conversion to Phase[] with status and color
  const phases = groups.slice(-14).map((g, i) => {
    const isLast = i === Math.min(groups.length, 14) - 1;
    const daysSince = (now - new Date(g.end).getTime()) / 86400000;
    
    let status: PhaseStatus = 'done';
    if (isLast && daysSince < 14) status = 'active';
    else if (daysSince > 90) status = 'abandoned';

    return {
      ...g,
      status,
      color: COLORS[i % COLORS.length],
      idx: i
    };
  });

  const label = branchRatio >= 0.25 ? 'branch' : (branchRatio <= 0.15 ? 'time-gap' : 'mixed');

  return {
    phases,
    grouping: {
      mode: branchRatio > 0.2 ? 'branch' : 'time-gap',
      label,
      branchRatio
    }
  };
}

function groupByBranch(commits: Commit[]) {
  const groups: PhaseGroup[] = [];
  let curCommitGroup: Commit[] = [];
  let curBranch = '';

  commits.forEach(c => {
    if (c.branch !== curBranch) {
      if (curCommitGroup.length) {
        groups.push({
          name: nameFromBranch(curBranch, curCommitGroup),
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
      name: nameFromBranch(curBranch, curCommitGroup),
      branch: curBranch,
      items: curCommitGroup,
      start: curCommitGroup[0].date,
      end: curCommitGroup[curCommitGroup.length - 1].date
    });
  }
  return groups;
}

function nameFromBranch(branch: string, commits: Commit[]): string {
  if (!branch || branch === 'main' || branch === 'master' || branch === 'HEAD') {
    return nameFromCommits(commits);
  }

  const baseName = branch
    .replace(/^(feat|fix|feature|hotfix|chore|release|dev)\//i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const normalized = baseName.toLowerCase();
  const tooGeneric = !normalized || ['main', 'master', 'dev', 'release', 'feature', 'fix', 'chore'].includes(normalized);
  if (tooGeneric) {
    return nameFromCommits(commits);
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

function topicFromCommit(commit: Commit, pathDomains: Record<string, string>) {
  if (commit.branch && !['main', 'master', 'HEAD'].includes(commit.branch)) {
    const baseName = commit.branch
      .replace(/^(feat|fix|feature|hotfix|chore|release|dev)\//i, '')
      .replace(/[-_]/g, ' ')
      .trim();
    const normalized = baseName.toLowerCase();
    const tooGeneric = !normalized || ['main', 'master', 'dev', 'release', 'feature', 'fix', 'chore'].includes(normalized);
    if (!tooGeneric) return toTitleCase(baseName);
  }

  const msg = commit.msg.toLowerCase();
  const scopeMatch = commit.msg.match(/\w+\(([^)]+)\):/);
  const scope = scopeMatch?.[1]?.trim();
  if (scope && scope.length >= 3) return toTitleCase(scope);

  const pathDomain = pathDomains[commit.sha];
  if (pathDomain) return toTitleCase(pathDomain);

  const domain = DOMAIN_MAP.find(d => d.re.test(msg));
  if (domain) return domain.name;

  return null;
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

function buildFingerprint(commits: Commit[], pathDomains: Record<string, string>) {
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
  indexBySha: Map<string, number>
) {
  const n = slice.length;
  const minWindow = 6;
  const maxWindow = 14;
  const window = Math.min(maxWindow, Math.max(minWindow, Math.round(n / 12)));
  if (n < window * 2 + 4) return [];

  const hintSet = new Set(boundaryHints);
  const sims: Array<{ i: number; sim: number; hint: boolean; gap: number; merge: boolean; release: boolean }> = [];
  const gaps: number[] = [];

  for (let i = 1; i < n; i++) {
    const gap = Math.abs(new Date(slice[i].date).getTime() - new Date(slice[i - 1].date).getTime()) / 86400000;
    gaps.push(gap);
  }
  const gapThreshold = Math.max(5, percentile(gaps, 0.9));

  for (let i = window; i <= n - window; i++) {
    const prev = slice.slice(i - window, i);
    const next = slice.slice(i, i + window);
    const sim = cosineSimilarity(buildFingerprint(prev, pathDomains), buildFingerprint(next, pathDomains));
    const globalIdx = indexBySha.get(slice[i].sha);
    const hint = globalIdx !== undefined && hintSet.has(globalIdx);
    const gap = Math.abs(new Date(slice[i].date).getTime() - new Date(slice[i - 1].date).getTime()) / 86400000;
    const msg = slice[i].msg.toLowerCase();
    const merge = msg.startsWith('merge');
    const release = /release|version|changelog|tag/i.test(msg);
    sims.push({ i, sim, hint, gap, merge, release });
  }

  if (sims.length === 0) return [];
  const simValues = sims.map(s => s.sim);
  const low = percentile(simValues, 0.2);
  const mid = percentile(simValues, 0.4);
  const minSeg = Math.max(8, Math.floor(window * 1.5));

  const boundaries: number[] = [];
  let last = 0;
  for (const s of sims) {
    const hintish = s.hint || s.merge || s.release || s.gap >= gapThreshold;
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

function groupByTimeGaps(commits: Commit[]) {
  const GAP_DAYS = 3;
  const groups: PhaseGroup[] = [];
  let current: Commit[] = [];

  commits.forEach((c, i) => {
    if (i === 0) { current.push(c); return; }
    const prev = commits[i - 1];
    const gap = Math.abs(new Date(c.date).getTime() - new Date(prev.date).getTime()) / 86400000;
    
    if (gap >= GAP_DAYS) {
      if (current.length) groups.push(makeGroup(current));
      current = [c];
    } else {
      current.push(c);
    }
  });
  if (current.length) groups.push(makeGroup(current));
  return groups;
}

function refineGroupsBySemanticSignals(
  commits: Commit[],
  groups: PhaseGroup[],
  boundaryHints: number[],
  pathDomains: Record<string, string>
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
    const boundaries = detectSimilarityBoundaries(slice, boundaryHints, pathDomains, indexBySha);
    if (boundaries.length === 0) {
      refined.push(group);
      return;
    }

    let start = 0;
    for (const idx of boundaries) {
      const seg = slice.slice(start, idx);
      if (seg.length) refined.push(makeGroup(seg));
      start = idx;
    }

    const tail = slice.slice(start);
    if (tail.length) refined.push(makeGroup(tail));
  });

  return mergeAdjacentSameName(mergeSmallGroups(refined, 8));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function applyFallbackGrouping(
  commits: Commit[],
  groups: PhaseGroup[],
  boundaryHints: number[],
  pathDomains: Record<string, string>
) {
  const first = new Date(commits[0].date).getTime();
  const last = new Date(commits[commits.length - 1].date).getTime();
  const totalDays = Math.max(Math.round(Math.abs(last - first) / 86400000), 1);
  if (groups.length >= 4) return groups;
  const substantial = commits.length >= 150 || totalDays >= 90;
  if (!substantial) return groups;

  const topicGroups = buildTopicGroups(commits, boundaryHints, pathDomains);
  if (topicGroups.length > groups.length) {
    return topicGroups;
  }

  const target = Math.min(10, Math.max(4, Math.round(totalDays / 30)));
  const hinted = buildHintedGroups(commits, boundaryHints, target);
  if (hinted.length >= 4) {
    return hinted.length >= groups.length ? hinted : groups;
  }

  const bucketSize = Math.max(1, Math.ceil(commits.length / target));
  const fallback: PhaseGroup[] = [];

  for (let i = 0; i < commits.length; i += bucketSize) {
    const slice = commits.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    fallback.push(makeGroup(slice));
  }

  return fallback.length >= groups.length ? fallback : groups;
}

function buildTopicGroups(
  commits: Commit[],
  boundaryHints: number[],
  pathDomains: Record<string, string>
) {
  const topics = commits.map(c => topicFromCommit(c, pathDomains));
  const hintSet = new Set(boundaryHints);
  const groups: PhaseGroup[] = [];
  const window = 8;
  const minHits = 3;
  const minSize = 8;

  let start = 0;
  let currentTopic = topics[0] || null;

  for (let i = 1; i < commits.length; i++) {
    if (hintSet.has(i)) {
      const slice = commits.slice(start, i);
      if (slice.length) groups.push(makeGroup(slice));
      start = i;
      currentTopic = topics[i] || currentTopic;
      continue;
    }

    const t = topics[i];
    if (t && t !== currentTopic) {
      let hits = 0;
      for (let j = i; j < Math.min(commits.length, i + window); j++) {
        if (topics[j] === t) hits += 1;
      }
      if (hits >= minHits) {
        const slice = commits.slice(start, i);
        if (slice.length) groups.push(makeGroup(slice));
        start = i;
        currentTopic = t;
      }
    }
  }

  const tail = commits.slice(start);
  if (tail.length) groups.push(makeGroup(tail));

  const compacted = mergeSmallGroups(groups, minSize);
  return mergeAdjacentSameName(compacted);
}

function mergeSmallGroups(groups: PhaseGroup[], minSize: number) {
  if (groups.length <= 1) return groups;
  const merged: PhaseGroup[] = [];
  for (const group of groups) {
    if (group.items.length < minSize && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.items.push(...group.items);
      prev.end = group.end;
      prev.name = nameFromCommits(prev.items);
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
      merged[0].name = nameFromCommits(merged[0].items);
    }
  }

  return merged;
}

function mergeAdjacentSameName(groups: PhaseGroup[]) {
  if (groups.length <= 1) return groups;
  const merged: PhaseGroup[] = [groups[0]];
  for (let i = 1; i < groups.length; i++) {
    const prev = merged[merged.length - 1];
    const next = groups[i];
    if (prev.name === next.name) {
      prev.items.push(...next.items);
      prev.end = next.end;
      prev.name = nameFromCommits(prev.items);
      prev.branch = prev.branch || next.branch;
    } else {
      merged.push(next);
    }
  }
  return merged;
}

function buildHintedGroups(commits: Commit[], boundaryHints: number[], target: number) {
  if (boundaryHints.length === 0) return [];
  const indices = [...new Set(boundaryHints)]
    .filter(i => i > 0 && i < commits.length - 1)
    .sort((a, b) => a - b);
  if (indices.length === 0) return [];

  const desired = Math.max(0, target - 1);
  const picked = pickEvenly(indices, desired);
  if (picked.length === 0) return [];

  const minSize = Math.max(15, Math.floor(commits.length / (target * 3)));
  const filtered: number[] = [];
  let last = 0;
  for (const idx of picked) {
    if (idx - last >= minSize) {
      filtered.push(idx);
      last = idx;
    }
  }
  if (filtered.length === 0) return [];

  const groups: PhaseGroup[] = [];
  let start = 0;
  for (const idx of filtered) {
    const slice = commits.slice(start, idx);
    if (slice.length) groups.push(makeGroup(slice));
    start = idx;
  }
  const tail = commits.slice(start);
  if (tail.length) groups.push(makeGroup(tail));
  return groups;
}

function pickEvenly(indices: number[], desired: number) {
  if (desired <= 0) return [];
  if (indices.length <= desired) return indices;
  const step = indices.length / (desired + 1);
  const picked: number[] = [];
  for (let i = 1; i <= desired; i++) {
    const idx = Math.min(indices.length - 1, Math.floor(i * step));
    picked.push(indices[idx]);
  }
  return [...new Set(picked)];
}

function makeGroup(commits: Commit[]): PhaseGroup {
  const start = commits[0].date;
  const end = commits[commits.length - 1].date;
  return {
    name: nameFromCommits(commits),
    items: commits,
    start,
    end,
    branch: commits[0].branch || 'main'
  };
}

function nameFromCommits(commits: Commit[]): string {
  // Filter out merge commits — they add noise not signal
  const meaningful = commits.filter(c =>
    !c.msg.toLowerCase().startsWith('merge') &&
    !c.msg.toLowerCase().startsWith('revert') &&
    !c.msg.toLowerCase().startsWith('bump')
  );

  // If all commits are merge commits/noise, use all commits as source
  const source = meaningful.length > 0 ? meaningful : commits;

  const domainName = domainNameFromCommits(source);
  if (domainName) return domainName;

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
