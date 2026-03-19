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

  const brRes = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers });
  if (!brRes.ok) {
    const msg = await toGitHubError(brRes, hasToken);
    throw new Error(msg);
  }
  const branches = (await brRes.json()) as GitHubBranch[];
  const branchCandidates = branches.filter((b) => b.name !== defaultBranch);
  const branchesToCompare = branchCandidates.slice(0, maxBranches);
  const hitBranchLimit = branchCandidates.length > maxBranches;

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
