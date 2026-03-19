import type { PhaseFingerprint, PhaseNameSource } from '../types';
import type { BoundaryScore } from './boundaries';
import { toTitleCase } from './classify';

const COMPONENT_LABELS: Record<string, string> = {
  pathDomain: 'path/domain shift',
  taxonomy: 'label/scope shift',
  topic: 'topic shift',
  release: 'release or hotfix marker',
  contributor: 'contributor change',
  branch: 'branch hint change',
  timeGap: 'time gap'
};

export function buildPhaseNameReason(
  fingerprint: PhaseFingerprint,
  source: PhaseNameSource
) {
  switch (source) {
    case 'workstream':
      return `Named for shared workstream title: ${quote(fingerprint.dominantWorkstreamTitles[0]?.value)}.`;
    case 'domain':
      return `Named for dominant domain: ${quote(formatDomain(fingerprint.dominantDomains[0]?.value))}.`;
    case 'label-scope':
      return `Named for dominant label/scope: ${quote(toTitleCase(fingerprint.dominantLabelsScopes[0]?.value || ''))}.`;
    case 'topic':
      return `Named for dominant topics: ${formatTopics(fingerprint)}.`;
    default:
      return 'Named from the phase date range.';
  }
}

export function buildBoundaryReason(boundaryScore?: BoundaryScore, isFirst = false) {
  if (isFirst) return 'Boundary starts the history timeline.';
  if (!boundaryScore) return 'Boundary inferred from contiguous work items.';

  const top = Object.entries(boundaryScore.components)
    .sort((a, b) => b[1].weighted - a[1].weighted)
    .filter(([, component]) => component.weighted > 0.1)
    .slice(0, 2)
    .map(([key]) => COMPONENT_LABELS[key] || key);

  if (top.length === 0) return 'Boundary inferred from contiguous work items.';
  return `Boundary driven by ${top.join(' + ')}.`;
}

function formatDomain(domain?: string) {
  if (!domain) return 'unknown';
  return toTitleCase(domain.replace(/[-_]/g, ' ').replace(/\//g, ' / '));
}

function formatTopics(fingerprint: PhaseFingerprint) {
  const tokens = fingerprint.dominantTopics
    .map(item => item.token.replace(/^(type|scope):/, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map(token => toTitleCase(token));
  if (tokens.length === 0) return 'the dominant topics';
  return tokens.join(' · ');
}

function quote(value?: string) {
  if (!value) return 'unknown';
  return `“${value}”`;
}
