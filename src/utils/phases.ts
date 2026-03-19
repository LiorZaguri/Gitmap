import type { Commit, Phase, PhaseStatus } from '../types';
import { cls, COLORS, STOP_WORDS, toTitleCase } from './classify';

export function buildPhases(commits: any[]): Phase[] {
  console.log('Total commits received:', commits.length);
  console.log('Branch distribution:', commits.reduce((acc, c) => {
    acc[c.branch] = (acc[c.branch] || 0) + 1;
    return acc;
  }, {} as Record<string, number>));

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

  // (Word frequency logic included as requested, even if only Returning baseName)
  const words = commits
    .flatMap(c => c.msg.toLowerCase().split(/[\s\(\)\:\-\/]+/))
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const freq: Record<string, number> = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  // const topWord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];

  return toTitleCase(baseName);
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
  const words = commits
    .flatMap(c => {
      const scopeMatch = c.msg.match(/\w+\((\w+)\):/);
      const scope = scopeMatch ? [scopeMatch[1]] : [];
      return [...scope, ...c.msg.toLowerCase().split(/[\s\(\)\:\-\/]+/)];
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


