import type { Commit } from '../types';
import type { PullRequestMeta } from './github';

export type WorkItemKind = 'pull_request' | 'commit_window';

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
): WorkItemDraft[] {
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

  return items.filter(item => item.commits.length > 0);
}
