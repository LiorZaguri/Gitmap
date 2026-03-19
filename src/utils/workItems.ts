import type { Commit, WorkItem, WorkItemKind } from '../types';
import type { PullRequestMeta } from './github';
import { STOP_WORDS } from './classify';

interface WorkItemDraft {
  kind: WorkItemKind;
  title: string;
  commits: Commit[];
  pullRequest?: PullRequestMeta;
  pathDomains: Set<string>;
  typesScopes: Set<string>;
  contributors: Set<string>;
  topicTokens: Set<string>;
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
  options?: { windowSize?: number; pathDomains?: Record<string, string> }
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
    .map(item => toWorkItem(item));
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
    topicTokens: new Set<string>()
  };
  appendCommit(draft, commit, commitDomains);
  if (pr?.files && pr.files.length > 0) {
    extractDomainsFromFiles(pr.files).forEach(domain => draft.pathDomains.add(domain));
  }
  return draft;
}

function appendCommit(draft: WorkItemDraft, commit: Commit, commitDomains: Record<string, string>) {
  draft.commits.push(commit);
  draft.contributors.add(commit.author);
  const domain = commitDomains[commit.sha];
  if (domain) draft.pathDomains.add(domain);
  extractTypesScopes(commit).forEach(ts => draft.typesScopes.add(ts));
  extractTokens(commit.msg).forEach(token => draft.topicTokens.add(token));
}

function extractTypesScopes(commit: Commit) {
  const types: string[] = [];
  if (commit.type) types.push(commit.type);
  const scopeMatch = commit.msg.match(/\w+\(([^)]+)\):/);
  const scope = scopeMatch?.[1]?.trim();
  if (scope) types.push(`${commit.type}(${scope})`);
  return types;
}

function extractTokens(msg: string) {
  return msg
    .toLowerCase()
    .split(/[\s():/.-]+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function extractDomainsFromFiles(files: string[]) {
  const domains = new Set<string>();
  files.forEach(file => {
    const top = file.split('/')[0];
    if (top && top !== '(root)') domains.add(top);
  });
  return domains;
}

function isSimilarCommit(
  current: WorkItemDraft,
  commit: Commit,
  commitDomains: Record<string, string>
) {
  const domain = commitDomains[commit.sha];
  if (domain && current.pathDomains.has(domain)) return true;
  const tokens = new Set(extractTokens(commit.msg));
  if (tokens.size === 0 || current.topicTokens.size === 0) return false;
  let overlap = 0;
  tokens.forEach(token => {
    if (current.topicTokens.has(token)) overlap += 1;
  });
  const ratio = overlap / tokens.size;
  return overlap >= MIN_TOKEN_OVERLAP && ratio >= MIN_TOKEN_RATIO;
}

function toWorkItem(item: WorkItemDraft): WorkItem {
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
  const releaseFlags: string[] = [];

  return {
    kind: item.kind,
    title: item.title,
    bodySummary,
    commitShas,
    changedFiles,
    pathDomains,
    labels: [],
    typesScopes,
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
