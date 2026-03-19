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
  options?: { boundaryHints?: number[] }
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

  groups = applyFallbackGrouping(raw, groups, options?.boundaryHints || []);

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

function applyFallbackGrouping(commits: Commit[], groups: PhaseGroup[], boundaryHints: number[]) {
  const first = new Date(commits[0].date).getTime();
  const last = new Date(commits[commits.length - 1].date).getTime();
  const totalDays = Math.max(Math.round(Math.abs(last - first) / 86400000), 1);
  if (groups.length >= 4) return groups;
  const substantial = commits.length >= 150 || totalDays >= 90;
  if (!substantial) return groups;

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
