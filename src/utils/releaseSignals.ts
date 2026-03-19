import type { Commit } from '../types';
import type { PullRequestMeta, ReleaseMeta } from './github';

export interface ReleaseSignalInput {
  commits: Commit[];
  pullRequest?: PullRequestMeta;
  release?: ReleaseMeta | null;
}

const HOTFIX_RE = /hotfix|hot-fix/i;
const CHERRY_RE = /cherry[- ]?pick/i;
const RELEASE_RE = /release|changelog|version|bump/i;
const RELEASE_WINDOW_DAYS = 7;

export function detectReleaseFlags(input: ReleaseSignalInput) {
  const flags = new Set<string>();
  const text = buildText(input.commits, input.pullRequest);

  if (CHERRY_RE.test(text)) flags.add('cherry-pick');
  if (HOTFIX_RE.test(text)) flags.add('hotfix');
  if (RELEASE_RE.test(text)) flags.add('release-maintenance');

  const release = input.release;
  if (release?.publishedAt) {
    const endDate = input.commits[input.commits.length - 1]?.date;
    if (endDate && isWithinDays(endDate, release.publishedAt, RELEASE_WINDOW_DAYS)) {
      flags.add('near-release');
    }
  } else if (release?.tag) {
    flags.add('tag-latest');
  }

  return Array.from(flags.values());
}

function buildText(commits: Commit[], pullRequest?: PullRequestMeta) {
  const commitText = commits.map(c => c.msg).join(' ').toLowerCase();
  const prText = [pullRequest?.title, pullRequest?.body].filter(Boolean).join(' ').toLowerCase();
  return `${commitText} ${prText}`.trim();
}

function isWithinDays(a: string, b: string, days: number) {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= days * 86400000;
}
