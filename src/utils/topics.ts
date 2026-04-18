import { STOP_WORDS, parseConventionalHeader } from './classify';

export interface TopicToken {
  token: string;
  weight: number;
}

const JUNK_TOKENS = new Set([
  'merge',
  'pull',
  'request',
  'pr',
  'into',
  'from',
  'branch',
  'main',
  'master',
  'develop',
  'release',
  'releases',
  'version',
  'bump',
  'update',
  'updates',
  'fix',
  'fixed',
  'feat',
  'feature',
  'chore',
  'ci',
  'refactor',
  'docs',
  'doc',
  'test',
  'tests',
  'wip',
  'temp'
]);

export function extractTopicWeights(text: string, baseWeight: number) {
  const weights = new Map<string, number>();
  const parsed = parseConventionalHeader(text);

  if (parsed.type) {
    addWeight(weights, `type:${parsed.type}`, baseWeight + 1);
  }
  if (parsed.scope) {
    addWeight(weights, `scope:${parsed.scope}`, baseWeight + 2);
  }

  const subject = normalizeSubject(parsed.subject || text);
  tokenize(subject).forEach(token => addWeight(weights, token, baseWeight));

  return weights;
}

export function mergeTopicWeights(target: Map<string, number>, source: Map<string, number>) {
  source.forEach((weight, token) => {
    addWeight(target, token, weight);
  });
}

export function toTopicTokenList(weights: Map<string, number>): TopicToken[] {
  return Array.from(weights.entries())
    .map(([token, weight]) => ({ token, weight }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.token.localeCompare(b.token);
    });
}

function normalizeSubject(text: string) {
  return text
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^(feat|fix|chore|docs|refactor|test|tests|build|ci|perf|style)\s*[:/]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[\s():/.-]+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token) && !JUNK_TOKENS.has(token));
}

function addWeight(weights: Map<string, number>, token: string, weight: number) {
  if (!token) return;
  weights.set(token, (weights.get(token) || 0) + weight);
}
