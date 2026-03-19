export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
      name: string;
    };
  };
}

interface GitHubRepo {
  default_branch?: string;
}

interface GitHubBranch {
  name: string;
}

interface GitHubCompare {
  commits?: Array<{ sha: string }>;
}

export interface GitHubLimits {
  commitsPerPage: number;
  maxPages: number;
  maxBranches: number;
}

export interface GitHubSnapshot {
  commits: GitHubCommit[];
  defaultBranch: string;
  branchMap: Record<string, string>;
  hitCommitLimit: boolean;
  hitBranchLimit: boolean;
  branchesCompared: number;
}

interface GitHubCommitDetail {
  files?: Array<{ filename: string }>;
}

interface GitHubPull {
  number: number;
  title: string;
  body?: string;
  merged_at?: string | null;
}

interface GitHubPullFile {
  filename: string;
}

export interface PullRequestMeta {
  number: number;
  title: string;
  body?: string;
  files?: string[];
  mergedAt?: string | null;
}

const toGitHubError = async (r: Response, hasToken: boolean) => {
  const remaining = r.headers.get('x-ratelimit-remaining');
  if (r.status === 403 && remaining === '0') {
    return 'GitHub rate limit reached. Try again later or add a token.';
  }
  if (r.status === 401) return 'Invalid or expired GitHub token.';
  if (r.status === 404) {
    return hasToken
      ? 'Repo not found.'
      : 'Repo not found or private. Add a token to access private repos.';
  }
  if (r.status === 403) {
    return hasToken
      ? 'Access denied. Check repo permissions for this token.'
      : 'Private repo. Add a token to access it.';
  }
  const e = await r.json().catch(() => ({} as { message?: string }));
  return e.message || `GitHub error ${r.status}`;
};

export async function fetchMergeCommitHints(
  repo: string,
  headers: Record<string, string>,
  commits: Array<{ sha: string; msg: string }>,
  options?: { maxCandidates?: number; minFiles?: number; dominance?: number }
) {
  const maxCandidates = options?.maxCandidates ?? 20;
  const minFiles = options?.minFiles ?? 5;
  const dominance = options?.dominance ?? 0.6;

  const candidates = commits
    .map((c, idx) => ({ ...c, idx }))
    .filter(c => /^merge\b/i.test(c.msg));
  const selected = candidates.slice(-maxCandidates);
  const hints: number[] = [];

  for (const c of selected) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits/${c.sha}`, { headers });
    if (!r.ok) {
      const remaining = r.headers.get('x-ratelimit-remaining');
      if (r.status === 403 && remaining === '0') break;
      continue;
    }
    const data = (await r.json()) as GitHubCommitDetail;
    const files = data.files || [];
    if (files.length < minFiles) continue;

    const counts: Record<string, number> = {};
    files.forEach(f => {
      const top = f.filename.split('/')[0] || '(root)';
      counts[top] = (counts[top] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    const count = top[1];
    if (count / files.length >= dominance) hints.push(c.idx);
  }

  return hints;
}

export async function fetchCommitPathDomains(
  repo: string,
  headers: Record<string, string>,
  commits: Array<{ sha: string; msg: string }>,
  options?: { maxCommits?: number; minFiles?: number; dominance?: number }
) {
  const maxCommits = options?.maxCommits ?? 40;
  const minFiles = options?.minFiles ?? 5;
  const dominance = options?.dominance ?? 0.6;

  const mergeCandidates = commits.filter(c => /^merge\b/i.test(c.msg)).map(c => c.sha);
  const spaced: string[] = [];
  if (commits.length > 0) {
    const step = Math.max(1, Math.floor(commits.length / maxCommits));
    for (let i = 0; i < commits.length && spaced.length < maxCommits; i += step) {
      spaced.push(commits[i].sha);
    }
  }

  const unique = [...new Set([...mergeCandidates, ...spaced])].slice(0, maxCommits);
  const domainMap: Record<string, string> = {};

  for (const sha of unique) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, { headers });
    if (!r.ok) {
      const remaining = r.headers.get('x-ratelimit-remaining');
      if (r.status === 403 && remaining === '0') break;
      continue;
    }
    const data = (await r.json()) as GitHubCommitDetail;
    const files = data.files || [];
    if (files.length < minFiles) continue;

    const counts: Record<string, number> = {};
    files.forEach(f => {
      const top = f.filename.split('/')[0] || '(root)';
      counts[top] = (counts[top] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    const count = top[1];
    if (count / files.length >= dominance) {
      const name = top[0].replace(/[-_]/g, ' ').trim();
      if (name && name !== '(root)') domainMap[sha] = name.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return domainMap;
}

export async function fetchPullRequestMetadata(
  repo: string,
  headers: Record<string, string>,
  commits: Array<{ sha: string; msg: string }>,
  options?: { maxCommits?: number; maxFiles?: number }
) {
  const maxCommits = options?.maxCommits ?? 25;
  const maxFiles = options?.maxFiles ?? 100;

  const candidates = commits
    .map((c, idx) => ({ ...c, idx }))
    .filter(c => /^merge\b/i.test(c.msg) || /pull request/i.test(c.msg));
  const selected = candidates.slice(-maxCommits);
  const prMap: Record<string, PullRequestMeta> = {};
  const filesCache = new Map<number, string[]>();

  const pullHeaders = {
    ...headers,
    Accept: 'application/vnd.github.groot-preview+json'
  };

  for (const c of selected) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits/${c.sha}/pulls`, { headers: pullHeaders });
    if (!r.ok) {
      const remaining = r.headers.get('x-ratelimit-remaining');
      if (r.status === 403 && remaining === '0') break;
      continue;
    }
    const pulls = (await r.json()) as GitHubPull[];
    if (!pulls || pulls.length === 0) continue;
    const pr = pulls[0];
    if (!pr?.title) continue;

    let files: string[] | undefined;
    if (filesCache.has(pr.number)) {
      files = filesCache.get(pr.number);
    } else {
      const fr = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr.number}/files?per_page=${maxFiles}`, { headers });
      if (fr.ok) {
        const data = (await fr.json()) as GitHubPullFile[];
        files = data.map(f => f.filename);
        filesCache.set(pr.number, files);
      } else {
        const remaining = fr.headers.get('x-ratelimit-remaining');
        if (fr.status === 403 && remaining === '0') break;
      }
    }

    prMap[c.sha] = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      mergedAt: pr.merged_at ?? null,
      files
    };
  }

  return prMap;
}

export async function fetchGitHubSnapshot(
  repo: string,
  headers: Record<string, string>,
  hasToken: boolean,
  limits: GitHubLimits,
  onStage?: (stage: string) => void
): Promise<GitHubSnapshot> {
  const { commitsPerPage, maxPages, maxBranches } = limits;

  onStage?.('Fetching commits');
  const commits: GitHubCommit[] = [];
  let hitCommitLimit = false;
  for (let p = 1; p <= maxPages; p++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=${commitsPerPage}&page=${p}`, { headers });
    if (!r.ok) {
      const msg = await toGitHubError(r, hasToken);
      throw new Error(msg);
    }
    const d = (await r.json()) as GitHubCommit[];
    commits.push(...d);
    if (d.length < commitsPerPage) break;
    if (p === maxPages) hitCommitLimit = true;
  }

  onStage?.('Fetching repo data');
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) {
    const msg = await toGitHubError(repoRes, hasToken);
    throw new Error(msg);
  }
  const repoData = (await repoRes.json()) as GitHubRepo;
  const defaultBranch = repoData.default_branch || 'main';

  onStage?.('Fetching branches');
  const brRes = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers });
  if (!brRes.ok) {
    const msg = await toGitHubError(brRes, hasToken);
    throw new Error(msg);
  }
  const branches = (await brRes.json()) as GitHubBranch[];
  const branchCandidates = branches.filter((b) => b.name !== defaultBranch);
  const branchesToCompare = branchCandidates.slice(0, maxBranches);
  const hitBranchLimit = branchCandidates.length > maxBranches;

  onStage?.('Mapping branches');
  const branchMap: Record<string, string> = {};
  await Promise.allSettled(
    branchesToCompare.map(async (b) => {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/compare/${defaultBranch}...${b.name}`,
          { headers }
        );
        if (!r.ok) return;
        const data = (await r.json()) as GitHubCompare;
        (data.commits || []).forEach((c) => {
          branchMap[c.sha] = b.name;
        });
      } catch (e) {
        console.warn(`Failed to compare branch ${b.name}:`, e);
      }
    })
  );

  return {
    commits,
    defaultBranch,
    branchMap,
    hitCommitLimit,
    hitBranchLimit,
    branchesCompared: branchesToCompare.length
  };
}
