import type { Commit, Phase, PhaseStatus } from '../types';
import { cls, pname, COLORS } from './classify';

export function buildPhases(commits: any[]): Phase[] {
  // Convert raw GitHub commits to our Commit type with guards
  const raw = (commits.map(c => {
    if (!c?.commit?.message) return null;
    return {
      sha: c.sha,
      msg: c.commit.message.split('\n')[0],
      date: c.commit.author.date,
      author: c.commit.author.name,
      branch: c.branch || 'main',
      type: cls(c.commit.message.split('\n')[0])
    };
  }).filter(Boolean) as Commit[]);

  const branchCommits = raw.filter(c =>
    c.branch && c.branch !== 'main' && c.branch !== 'master' && c.branch !== 'HEAD'
  );
  const branchRatio = branchCommits.length / Math.max(raw.length, 1);

  let groups: any[] = [];
  if (branchRatio > 0.3) {
    groups = groupByBranch(raw);
  } else {
    groups = groupByTimeGaps(raw);
  }

  const now = new Date().getTime();
  // Final conversion to Phase[] with status and color
  return groups.slice(-14).map((g, i) => {
    const isLast = i === Math.min(groups.length, 14) - 1;
    const daysSince = (now - new Date(g.end).getTime()) / 86400000;
    
    let status: PhaseStatus = 'done';
    if (isLast && daysSince < 14) status = 'active';
    else if (daysSince > 90) status = 'abandoned';

    return {
      ...g,
      status,
      color: COLORS[i % COLORS.length]
    };
  });
}

function groupByBranch(commits: Commit[]) {
  const groups: any[] = [];
  let cur: any = null;

  commits.forEach(c => {
    const name = pname(c.msg, c.branch);
    if (!cur || cur.name !== name) {
      if (cur) groups.push(cur);
      cur = { name, branch: c.branch, items: [c], start: c.date, end: c.date };
    } else {
      cur.items.push(c);
      cur.end = c.date;
    }
  });
  if (cur) groups.push(cur);
  return groups;
}

function groupByTimeGaps(commits: Commit[]) {
  const GAP_DAYS = 3;
  const groups: any[] = [];
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

function makeGroup(commits: Commit[]) {
  const types = commits.map(c => c.type);
  const dominant = mode(types);
  const start = commits[0].date;
  const end = commits[commits.length - 1].date;
  const month = new Date(start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return {
    name: `${dominant} · ${month}`,
    items: commits,
    start,
    end,
    branch: commits[0].branch || 'main'
  };
}

function mode(arr: string[]): string {
  const counts: Record<string, number> = {};
  arr.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'other';
}
