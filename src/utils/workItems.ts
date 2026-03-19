import type { Commit, WorkItem, WorkItemKind } from '../types';
import type { PullRequestMeta } from './github';

export interface WorkItemDraft {
  kind: WorkItemKind;
  title: string;
  commits: Commit[];
  pullRequest?: PullRequestMeta;
}

const DEFAULT_WINDOW = 4;

function titleForWindow(commits: Commit[]) {
  if (commits.length === 0) return 'Commit batch';
  if (commits.length === 1) return commits[0].msg;
  return `Commit batch: ${commits[0].msg}`;
}

export function buildWorkItems(
  commits: Commit[],
  pullRequests: Record<string, PullRequestMeta>,
  options?: { windowSize?: number }
): WorkItem[] {
  const windowSize = Math.max(1, options?.windowSize ?? DEFAULT_WINDOW);
  const items: WorkItemDraft[] = [];
  let current: WorkItemDraft | null = null;

  for (const commit of commits) {
    const pr = pullRequests[commit.sha];
    if (pr) {
      if (current?.kind === 'commit_window') {
        current.title = titleForWindow(current.commits);
        items.push(current);
        current = null;
      }

      if (current?.kind === 'pull_request' && current.pullRequest?.number === pr.number) {
        current.commits.push(commit);
        continue;
      }

      if (current) {
        current.title = current.kind === 'commit_window' ? titleForWindow(current.commits) : current.title;
        items.push(current);
      }

      current = {
        kind: 'pull_request',
        title: pr.title || `PR #${pr.number}`,
        commits: [commit],
        pullRequest: pr
      };
      continue;
    }

    if (!current || current.kind === 'pull_request') {
      if (current) items.push(current);
      current = {
        kind: 'commit_window',
        title: titleForWindow([commit]),
        commits: [commit]
      };
      continue;
    }

    if (current.commits.length >= windowSize) {
      current.title = titleForWindow(current.commits);
      items.push(current);
      current = {
        kind: 'commit_window',
        title: titleForWindow([commit]),
        commits: [commit]
      };
      continue;
    }

    current.commits.push(commit);
  }

  if (current) {
    current.title = current.kind === 'commit_window' ? titleForWindow(current.commits) : current.title;
    items.push(current);
  }

  return items
    .filter(item => item.commits.length > 0)
    .map(item => toWorkItem(item));
}

function toWorkItem(item: WorkItemDraft): WorkItem {
  const commits = item.commits;
  const commitShas = commits.map(c => c.sha);
  const contributors = [...new Set(commits.map(c => c.author).filter(Boolean))];
  const startDate = commits[0]?.date ?? '';
  const endDate = commits[commits.length - 1]?.date ?? startDate;
  const sourceBranchHint = commits.find(c => c.branch)?.branch;
  const bodySummary = item.pullRequest?.body?.trim();

  return {
    kind: item.kind,
    title: item.title,
    bodySummary,
    commitShas,
    changedFiles: item.pullRequest?.files ?? [],
    pathDomains: [],
    labels: [],
    typesScopes: [],
    contributors,
    startDate,
    endDate,
    releaseFlags: [],
    sourceBranchHint,
    confidence: item.kind === 'pull_request' ? 0.6 : 0.3
  };
}
