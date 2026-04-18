import type { CommitType } from '../types';

export const COLORS = [
  '#00d084', '#4d9fff', '#a78bfa', '#ffb84d', '#ff5555', 
  '#ff79c6', '#5af8e8', '#ff9f43', '#c084fc', '#34d399', 
  '#60a5fa', '#fbbf24', '#f472b6', '#38bdf8', '#4ade80'
];

export const TYPE_COLORS: Record<CommitType, string> = {
  feat: '#00d084',
  fix: '#ff5555',
  perf: '#22c55e',
  refactor: '#4d9fff',
  docs: '#ffb84d',
  test: '#5af8e8',
  ci: '#a78bfa',
  build: '#f59e0b',
  style: '#f472b6',
  chore: '#6b7280',
  unknown: '#9ca3af'
};

export const STOP_WORDS = new Set([
  // commit type prefixes
  'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'style', 'perf', 'build', 'revert',
  'ci', 'cd', 'pipeline', 'workflow', 'actions',
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

interface ConventionalHeader {
  type?: string;
  scope?: string;
  subject: string;
}

const KNOWN_TYPES: Record<string, CommitType> = {
  feat: 'feat',
  feature: 'feat',
  fix: 'fix',
  hotfix: 'fix',
  bugfix: 'fix',
  refactor: 'refactor',
  perf: 'perf',
  performance: 'perf',
  docs: 'docs',
  doc: 'docs',
  test: 'test',
  tests: 'test',
  ci: 'ci',
  cd: 'ci',
  chore: 'chore',
  build: 'build',
  release: 'chore',
  deps: 'chore',
  dep: 'chore',
  revert: 'chore',
  style: 'style'
};

export function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, l => l.toUpperCase());
}

export function parseConventionalHeader(text: string): ConventionalHeader {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!match) {
    return { subject: trimmed };
  }
  return {
    type: match[1]?.toLowerCase(),
    scope: match[3]?.toLowerCase(),
    subject: match[5]?.trim() || trimmed
  };
}

export function cls(msg: string): CommitType {
  if (!msg) return 'unknown';
  const trimmed = msg.trim();
  const parsed = parseConventionalHeader(trimmed);
  if (parsed.type && KNOWN_TYPES[parsed.type]) return KNOWN_TYPES[parsed.type];

  const m = trimmed.toLowerCase();
  if (/^feat\b|^add\b|^implement\b|^creat|^introduc|^feature\b/.test(m)) return 'feat';
  if (/^fix\b|^bug\b|^patch\b|^resolv|^hotfix\b|^revert\b/.test(m)) return 'fix';
  if (/^perf\b|^performance\b/.test(m)) return 'perf';
  if (/^refactor\b|rename|restructur|clean\b|simplif|reorganiz|migrat|optimi[sz]/.test(m)) return 'refactor';
  if (/^docs?\b|readme|document|comment\b/.test(m)) return 'docs';
  if (/^test\b|^tests\b|spec\b|jest|mocha|vitest|cypress|playwright/.test(m)) return 'test';
  if (/^ci\b|^cd\b|pipeline|workflow|github actions|actions|circleci|travis/.test(m)) return 'ci';
  if (/^build\b|bundl|webpack|vite|rollup|esbuild/.test(m)) return 'build';
  if (/^style\b|prettier|eslint --fix|format\b|whitespace|semi-?colon/.test(m)) return 'style';
  if (/^chore\b|dependenc|^deps\b|package\b|version\b|bump\b|release\b|configur|^config\b|lint\b|merge\b/.test(m)) return 'chore';
  return 'unknown';
}
