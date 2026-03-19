import type { Commit, Phase, PhaseStatus } from '../types';
import { COLORS, pname, cls } from './classify';

export function buildPhases(commits: any[]): Phase[] {
  // Convert raw GitHub commits to our Commit type
  const raw: Commit[] = commits.map(c => ({
    sha: c.sha,
    msg: c.commit.message.split('\n')[0],
    date: c.commit.author.date,
    author: c.commit.author.name,
    branch: c.branch || 'main',
    type: cls(c.commit.message.split('\n')[0])
  }));

  const groups: { name: string; branch: string; items: Commit[]; start: string; end: string }[] = [];
  let cur: { name: string; branch: string; items: Commit[]; start: string; end: string } | null = null;

  raw.forEach(r => {
    const name = pname(r.msg, r.branch);
    if (!cur || cur.name !== name) {
      if (cur) groups.push(cur);
      cur = { name, branch: r.branch, items: [], start: r.date, end: r.date };
    }
    cur.items.push(r);
    cur.end = r.date;
  });

  if (cur) groups.push(cur);

  const merged: { name: string; branch: string; items: Commit[]; start: string; end: string }[] = [];
  groups.forEach(g => {
    const last = merged[merged.length - 1];
    if (last && last.name === g.name) {
      last.items.push(...g.items);
      last.end = g.end;
    } else {
      merged.push(g);
    }
  });

  const now = Date.now();
  // Return at most 14 phases as in the HTML version
  return merged.slice(0, 14).map((g, i) => {
    const endDate = new Date(g.end).getTime();
    const daysSince = Math.round((now - endDate) / 86400000);
    const isMain = g.branch === 'main' || g.branch === 'master';
    
    let status: PhaseStatus = 'done';
    if (daysSince < 7) {
      status = 'active';
    } else if (!isMain && daysSince > 60 && g.items.length < 5) {
      status = 'abandoned';
    }

    return {
      ...g,
      color: COLORS[i % COLORS.length],
      status,
      idx: i
    };
  });
}
