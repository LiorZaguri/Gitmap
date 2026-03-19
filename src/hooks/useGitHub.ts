import { useState, useCallback } from 'react';
import type { Commit, Phase, CommitType, AnalysisMeta } from '../types';
import { cls } from '../utils/classify';
import { buildPhases } from '../utils/phases';

const COMMITS_PER_PAGE = 100;
const MAX_PAGES = 5;
const MAX_BRANCHES = 15;
const MAX_COMMITS = COMMITS_PER_PAGE * MAX_PAGES;

interface GitHubCommit {
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

export function useGitHub() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [data, setData] = useState<{
    commits: Commit[];
    phases: Phase[];
    types: Record<CommitType, number>;
    contribs: string[];
    totalDays: number;
    analysis: AnalysisMeta;
  } | null>(null);

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

  const generate = useCallback(async (repo: string, token: string) => {
    setLoading(true);
    setError(null);
    setLoadingStage('Fetching commits');
    const tokenValue = token.trim();
    const hasToken = tokenValue.length > 0;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (hasToken) headers.Authorization = `token ${tokenValue}`;

    try {
      // 1. Fetch commits (up to 5 pages)
      const pages: GitHubCommit[] = [];
      let hitCommitLimit = false;
      for (let p = 1; p <= MAX_PAGES; p++) {
        const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=${COMMITS_PER_PAGE}&page=${p}`, { headers });
        if (!r.ok) {
          const msg = await toGitHubError(r, hasToken);
          throw new Error(msg);
        }
        const d = (await r.json()) as GitHubCommit[];
        pages.push(...d);
        if (d.length < COMMITS_PER_PAGE) break;
        if (p === MAX_PAGES) hitCommitLimit = true;
      }

      // Filter out any malformed commits before processing
      const validCommits = pages.filter(c =>
        c && 
        c.sha && 
        c.commit && 
        c.commit.message && 
        c.commit.author && 
        c.commit.author.date &&
        c.commit.author.name
      );
      validCommits.reverse();
      if (validCommits.length === 0) {
        throw new Error('Repo has no commits to analyze.');
      }

      // 2. Fetch repo and branches
      setLoadingStage('Fetching repo data');
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
      const branchesToCompare = branchCandidates.slice(0, MAX_BRANCHES);
      const hitBranchLimit = branchCandidates.length > MAX_BRANCHES;

      // 3. Map branches to commits (Feature branches take priority over main)
      // Using Compare API to get ONLY unique commits per branch
      const brMap: Record<string, string> = {};

      await Promise.allSettled(
        branchesToCompare
          .map(async (b) => {
            try {
              // Compare API: gives commits in branch but NOT in default branch
              const r = await fetch(
                `https://api.github.com/repos/${repo}/compare/${defaultBranch}...${b.name}`,
                { headers }
              );
              if (!r.ok) return;
              const data = (await r.json()) as GitHubCompare;
              // data.commits = commits unique to this branch
              (data.commits || []).forEach((c) => {
                brMap[c.sha] = b.name;
              });
            } catch (e) {
              console.warn(`Failed to compare branch ${b.name}:`, e);
            }
          })
      );

      // 4. Enrich commits with branch info and classify
      const enriched: Commit[] = validCommits.map(c => ({
        sha: c.sha,
        msg: c.commit.message.split('\n')[0],
        date: c.commit.author.date,
        author: c.commit.author.name,
        branch: brMap[c.sha] || defaultBranch,
        type: cls(c.commit.message.split('\n')[0])
      }));

      // CRITICAL: Reverse so oldest commits come first
      enriched.reverse();

      // 5. Build phases from enriched commits
      setLoadingStage('Analyzing phases');
      const { phases, grouping } = buildPhases(enriched);


      // 6. Calculate stats
      setLoadingStage('Building insights');
      const types: Record<CommitType, number> = {
        feat: 0,
        fix: 0,
        refactor: 0,
        docs: 0,
        test: 0,
        ci: 0,
        chore: 0,
        unknown: 0
      };
      enriched.forEach(c => {
        types[c.type] = (types[c.type] || 0) + 1;
      });

      const contribs = [...new Set(enriched.map(c => c.author))];
      
      const firstDate = new Date(enriched[0].date).getTime();
      const lastDate = new Date(enriched[enriched.length - 1].date).getTime();
      const totalDays = Math.max(Math.round(Math.abs(lastDate - firstDate) / 86400000), 1);

      const partial = hitCommitLimit || hitBranchLimit;
      const confidence = !partial ? 'high' : (hitCommitLimit && hitBranchLimit ? 'low' : 'medium');

      setData({
        commits: enriched,
        phases,
        types,
        contribs,
        totalDays,
        analysis: {
          commitsAnalyzed: enriched.length,
          branchesCompared: branchesToCompare.length,
          hitCommitLimit,
          hitBranchLimit,
          maxCommits: MAX_COMMITS,
          maxBranches: MAX_BRANCHES,
          partial,
          confidence,
          groupingMode: grouping.mode,
          groupingLabel: grouping.label,
          branchRatio: grouping.branchRatio
        }
      });
      
      // Save repo to localStorage for convenience
      localStorage.setItem('gitmap_repo', repo);

    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
      setLoadingStage(null);
    }
  }, []);

  return { ...data, loading, loadingStage, error, generate };
}
