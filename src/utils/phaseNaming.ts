import type { Commit, PhaseFingerprint, PhaseNameSource } from '../types';
import { toTitleCase } from './classify';

export interface PhaseNameResult {
  name: string;
  source: PhaseNameSource;
}

const TITLE_MIN_RATIO = 0.6;
const DOMAIN_MIN_RATIO = 0.45;
const LABEL_MIN_RATIO = 0.5;
const GENERIC_TOKENS = new Set(['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'tests', 'ci']);

export function buildPhaseName(fingerprint: PhaseFingerprint, commits: Commit[]): PhaseNameResult {
  const title = fingerprint.dominantWorkstreamTitles[0];
  if (title && (title.count >= 2 || title.ratio >= TITLE_MIN_RATIO)) {
    return { name: normalizeTitle(title.value), source: 'workstream' };
  }

  const domain = fingerprint.dominantDomains[0];
  if (domain && (domain.count >= 2 || domain.ratio >= DOMAIN_MIN_RATIO)) {
    return { name: formatDomain(domain.value), source: 'domain' };
  }

  const label = fingerprint.dominantLabelsScopes[0];
  if (label && (label.count >= 2 || label.ratio >= LABEL_MIN_RATIO)) {
    return { name: toTitleCase(label.value.replace(/[-_]/g, ' ')), source: 'label-scope' };
  }

  const topic = buildTopicName(fingerprint);
  if (topic) {
    return { name: topic, source: 'topic' };
  }

  return { name: fallbackName(commits), source: 'fallback' };
}

function buildTopicName(fingerprint: PhaseFingerprint) {
  const tokens = fingerprint.dominantTopics
    .map(item => item.token)
    .map(token => token.replace(/^(type|scope):/, ''))
    .filter(token => token.length > 2 && !GENERIC_TOKENS.has(token));

  const unique = Array.from(new Set(tokens));
  if (unique.length === 0) return null;
  const title = unique.slice(0, 2).join(' ');
  return toTitleCase(title);
}

function normalizeTitle(title: string) {
  return title
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^(feat|fix|chore|docs|refactor|test|build|ci)\s*[:/]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDomain(domain: string) {
  return toTitleCase(domain.replace(/[-_]/g, ' ').replace(/\//g, ' / '));
}

function fallbackName(commits: Commit[]) {
  const date = commits[0]?.date;
  if (!date) return 'Work';
  const month = new Date(date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return `Work · ${month}`;
}
