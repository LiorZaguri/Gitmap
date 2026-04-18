import type { Commit, WorkItem, WorkItemKind } from '../types';
import type { PullRequestMeta, ReleaseMeta } from './github';
import { extractPathDomainSummary } from './pathDomains';
import { detectReleaseFlags } from './releaseSignals';
import { extractTopicWeights, mergeTopicWeights, toTopicTokenList } from './topics';
import { parseConventionalHeader, toTitleCase } from './classify';

interface WorkItemDraft {
  kind: WorkItemKind;
  title: string;
  commits: Commit[];
  pullRequest?: PullRequestMeta;
  pathDomains: Set<string>;
  typesScopes: Set<string>;
  contributors: Set<string>;
  topicWeights: Map<string, number>;
}

const DEFAULT_WINDOW = 4;
const MIN_TOKEN_OVERLAP = 2;
const MIN_TOKEN_RATIO = 0.3;
const GENERIC_SCOPES = new Set(['core', 'misc', 'general', 'repo', 'app', 'project']);

function titleForWindow(commits: Commit[], commitDomains: Record<string, string>) {
  if (commits.length === 0) return 'Commit batch';
  if (commits.length === 1) return commits[0].msg;

  const scope = dominantScope(commits);
  if (scope) return toTitleCase(scope.replace(/[-_/]/g, ' '));

  const domain = dominantDomain(commits, commitDomains);
  if (domain) return toTitleCase(domain.replace(/[-_]/g, ' ').replace(/\//g, ' / '));

  const subject = dominantSubjectToken(commits);
  if (subject) return toTitleCase(subject);

  return `Commit batch: ${commits[0].msg}`;
}

export function buildWorkItems(
  commits: Commit[],
  pullRequests: Record<string, PullRequestMeta>,
  options?: { windowSize?: number; pathDomains?: Record<string, string>; releaseMeta?: ReleaseMeta | null }
): WorkItem[] {
  const windowSize = Math.max(1, options?.windowSize ?? DEFAULT_WINDOW);
  const items: WorkItemDraft[] = [];
  let current: WorkItemDraft | null = null;
  const commitDomains = options?.pathDomains ?? {};

  for (const commit of commits) {
    const pr = pullRequests[commit.sha];
    if (pr) {
      if (current && !(current.kind === 'pull_request' && current.pullRequest?.number === pr.number)) {
        current.title = current.kind === 'commit_window' ? titleForWindow(current.commits, commitDomains) : current.title;
        items.push(current);
        current = null;
      }

      if (!current) {
        current = createDraft('pull_request', commit, pr, commitDomains);
      } else {
        appendCommit(current, commit, commitDomains);
      }
      continue;
    }

    if (!current || current.kind === 'pull_request') {
      if (current) items.push(current);
      current = createDraft('commit_window', commit, undefined, commitDomains);
      continue;
    }

    if (!isSimilarCommit(current, commit, commitDomains) || current.commits.length >= windowSize) {
      current.title = titleForWindow(current.commits, commitDomains);
      items.push(current);
      current = createDraft('commit_window', commit, undefined, commitDomains);
      continue;
    }

    appendCommit(current, commit, commitDomains);
  }

  if (current) {
    current.title = current.kind === 'commit_window' ? titleForWindow(current.commits, commitDomains) : current.title;
    items.push(current);
  }

  return items
    .filter(item => item.commits.length > 0)
    .map(item => toWorkItem(item, options?.releaseMeta));
}

function createDraft(
  kind: WorkItemKind,
  commit: Commit,
  pr: PullRequestMeta | undefined,
  commitDomains: Record<string, string>
): WorkItemDraft {
  const draft: WorkItemDraft = {
    kind,
    title: kind === 'pull_request' ? (pr?.title || `PR #${pr?.number ?? ''}`.trim()) : titleForWindow([commit], commitDomains),
    commits: [],
    pullRequest: pr,
    pathDomains: new Set<string>(),
    typesScopes: new Set<string>(),
    contributors: new Set<string>(),
    topicWeights: new Map<string, number>()
  };
  appendCommit(draft, commit, commitDomains);
  if (pr?.files && pr.files.length > 0) {
    addDomainsFromFiles(draft, pr.files);
  }
  if (pr?.title) {
    mergeTopicWeights(draft.topicWeights, extractTopicWeights(pr.title, 3));
  }
  return draft;
}

function appendCommit(draft: WorkItemDraft, commit: Commit, commitDomains: Record<string, string>) {
  draft.commits.push(commit);
  draft.contributors.add(commit.author);
  const domain = commitDomains[commit.sha];
  if (domain) draft.pathDomains.add(domain);
  extractTypesScopes(commit).forEach(ts => draft.typesScopes.add(ts));
  mergeTopicWeights(draft.topicWeights, extractTopicWeights(commit.msg, 1));
}

function extractTypesScopes(commit: Commit) {
  const types: string[] = [];
  if (commit.type) types.push(commit.type);
  const scopeMatch = commit.msg.match(/\w+\(([^)]+)\):/);
  const scope = scopeMatch?.[1]?.trim();
  if (scope) types.push(`${commit.type}(${scope})`);
  return types;
}

function addDomainsFromFiles(draft: WorkItemDraft, files: string[]) {
  const summary = extractPathDomainSummary(files);
  summary.domains.forEach(domain => draft.pathDomains.add(domain.domain));
}

function isSimilarCommit(
  current: WorkItemDraft,
  commit: Commit,
  commitDomains: Record<string, string>
) {
  const domain = commitDomains[commit.sha];
  if (domain && current.pathDomains.has(domain)) return true;
  const commitTypesScopes = extractTypesScopes(commit);
  if (commitTypesScopes.some(typeScope => current.typesScopes.has(typeScope))) return true;
  const scope = parseConventionalHeader(commit.msg).scope?.trim().toLowerCase();
  if (scope && Array.from(current.typesScopes).some(typeScope => typeScope.endsWith(`(${scope})`))) return true;
  const weights = extractTopicWeights(commit.msg, 1);
  const tokens = new Set(weights.keys());
  if (tokens.size === 0 || current.topicWeights.size === 0) return false;
  let overlap = 0;
  tokens.forEach(token => {
    if (current.topicWeights.has(token)) overlap += 1;
  });
  const ratio = overlap / tokens.size;
  return overlap >= MIN_TOKEN_OVERLAP && ratio >= MIN_TOKEN_RATIO;
}

function dominantScope(commits: Commit[]) {
  const counts = new Map<string, number>();
  commits.forEach(commit => {
    const scope = parseConventionalHeader(commit.msg).scope?.trim().toLowerCase();
    if (!scope || GENERIC_SCOPES.has(scope)) return;
    counts.set(scope, (counts.get(scope) || 0) + 1);
  });
  const winner = topEntry(counts);
  if (!winner) return null;
  return winner.count >= 2 || winner.count === commits.length ? winner.value : null;
}

function dominantDomain(commits: Commit[], commitDomains: Record<string, string>) {
  const counts = new Map<string, number>();
  commits.forEach(commit => {
    const domain = commitDomains[commit.sha];
    if (!domain) return;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  });
  const winner = topEntry(counts);
  if (!winner) return null;
  return winner.count >= 2 ? winner.value : null;
}

function dominantSubjectToken(commits: Commit[]) {
  const counts = new Map<string, number>();
  commits.forEach(commit => {
    const weights = extractTopicWeights(commit.msg, 1);
    Array.from(weights.keys())
      .filter(token => !token.startsWith('type:') && !token.startsWith('scope:'))
      .forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
  });
  const winner = topEntry(counts);
  if (!winner) return null;
  return winner.count >= 2 ? winner.value : null;
}

function topEntry(counts: Map<string, number>) {
  const entries = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    });
  return entries[0];
}

function toWorkItem(item: WorkItemDraft, releaseMeta?: ReleaseMeta | null): WorkItem {
  const commits = item.commits;
  const commitShas = commits.map(c => c.sha);
  const contributors = Array.from(item.contributors);
  const startDate = commits[0]?.date ?? '';
  const endDate = commits[commits.length - 1]?.date ?? startDate;
  const sourceBranchHint = commits.find(c => c.branch)?.branch;
  const bodySummary = summarizeBody(item.pullRequest?.body);
  const pathDomains = Array.from(item.pathDomains);
  const typesScopes = Array.from(item.typesScopes);
  const changedFiles = item.pullRequest?.files ?? [];
  const topicTokens = toTopicTokenList(item.topicWeights);
  const releaseFlags = detectReleaseFlags({
    commits,
    pullRequest: item.pullRequest,
    release: releaseMeta
  });

  return {
    kind: item.kind,
    title: item.title,
    bodySummary,
    bodyText: item.pullRequest?.body,
    commitShas,
    changedFiles,
    pathDomains,
    labels: [],
    typesScopes,
    topicTokens,
    contributors,
    startDate,
    endDate,
    releaseFlags,
    sourceBranchHint,
    confidence: item.kind === 'pull_request' ? 0.7 : 0.3
  };
}

function summarizeBody(body?: string) {
  if (!body) return undefined;
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  const firstLine = trimmed.split('\n').find(line => line.trim().length > 0) || trimmed;
  if (firstLine.length <= 160) return firstLine;
  return `${firstLine.slice(0, 157)}...`;
}
