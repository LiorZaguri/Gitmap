import type { CommitType } from '../types';

export const COLORS = [
  '#00d084', '#4d9fff', '#a78bfa', '#ffb84d', '#ff5555', 
  '#ff79c6', '#5af8e8', '#ff9f43', '#c084fc', '#34d399', 
  '#60a5fa', '#fbbf24', '#f472b6', '#38bdf8', '#4ade80'
];

export const TYPE_COLORS: Record<CommitType, string> = {
  feat: '#00d084',
  fix: '#ff5555',
  refactor: '#4d9fff',
  docs: '#ffb84d',
  chore: '#6b7280',
  other: '#a78bfa'
};

export function cls(msg: string): CommitType {
  if (!msg) return 'other';
  const m = msg.toLowerCase();
  if (/^feat|^add |^implement|^build|^creat|^introduc/i.test(m)) return 'feat';
  if (/^fix|^bug|^patch|^resolv|^hotfix/i.test(m)) return 'fix';
  if (/^refactor|rename|restructur|clean|simplif|reorganiz|migrat/i.test(m)) return 'refactor';
  if (/^docs?|readme|document|comment/i.test(m)) return 'docs';
  if (/^chore|^ci|^build|depend|package|version|bump|release/i.test(m)) return 'chore';
  return 'other';
}

export function pname(_msg: string, branch?: string): string {
  if (branch && branch !== 'main' && branch !== 'master' && branch !== 'HEAD') {
    const n = branch.replace(/^(feat|fix|feature|hotfix|chore|release|dev)\//i, '').replace(/[-_]/g, ' ');
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  return 'General';
}

