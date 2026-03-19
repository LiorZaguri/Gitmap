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

export const STOP_WORDS = new Set([
  // commit type prefixes
  'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'style', 'perf', 'build', 'revert',
  // generic action verbs that appear in every repo
  'add', 'adds', 'added', 'update', 'updates', 'updated', 'remove', 'removes', 'removed',
  'change', 'changes', 'changed', 'move', 'moves', 'moved', 'rename', 'renames', 'renamed',
  'make', 'makes', 'made', 'use', 'uses', 'used', 'get', 'gets', 'set', 'sets',
  'fix', 'fixes', 'fixed', 'clean', 'cleans', 'cleaned', 'improve', 'improves',
  // conjunctions and prepositions
  'with', 'from', 'into', 'onto', 'upon', 'that', 'this', 'then', 'when', 'also',
  'more', 'some', 'very', 'just', 'only', 'even', 'back', 'via', 'per',
  // git-specific words
  'merge', 'merged', 'branch', 'commit', 'push', 'pull', 'request', 'origin',
  'master', 'main', 'head', 'rebase', 'cherry', 'pick',
  // short noise
  'and', 'the', 'for', 'not', 'new', 'now', 'but', 'all', 'any', 'its'
]);


export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, l => l.toUpperCase());
}

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


