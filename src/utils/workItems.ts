import type { Commit, WorkItem, WorkItemKind } from '../types';
import type { PullRequestMeta, ReleaseMeta } from './github';
import { extractPathDomainSummary } from './pathDomains';
import { detectReleaseFlags } from './releaseSignals';
import { extractTopicWeights, mergeTopicWeights, toTopicTokenList } from './topics';

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

function titleForWindow(commits: Commit[]) {
  if (commits.length === 0) return 'Commit batch';
  if (commits.length === 1) return commits[0].msg;
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
        current.title = current.kind === 'commit_window' ? titleForWindow(current.commits) : current.title;
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
      current.title = titleForWindow(current.commits);
      items.push(current);
      current = createDraft('commit_window', commit, undefined, commitDomains);
      continue;
    }

    appendCommit(current, commit, commitDomains);
  }

  if (current) {
    current.title = current.kind === 'commit_window' ? titleForWindow(current.commits) : current.title;
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
    title: kind === 'pull_request' ? (pr?.title || `PR #${pr?.number ?? ''}`.trim()) : titleForWindow([commit]),
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
