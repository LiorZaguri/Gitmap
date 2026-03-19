import { useState, useCallback } from 'react';
import type { Commit, Phase, CommitType } from '../types';
import { cls } from '../utils/classify';
import { buildPhases } from '../utils/phases';

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
  const [data, setData] = useState<{
    commits: Commit[];
    phases: Phase[];
    types: Record<CommitType, number>;
    contribs: string[];
    totalDays: number;
  } | null>(null);

  const generate = useCallback(async (repo: string, token: string) => {
    setLoading(true);
    setError(null);
    const h = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    try {
      // 1. Fetch commits (up to 5 pages)
      const pages: GitHubCommit[] = [];
      for (let p = 1; p <= 5; p++) {
        const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100&page=${p}`, { headers: h });
        if (!r.ok) {
          const e = await r.json().catch(() => ({} as { message?: string }));
          throw new Error(e.message || `GitHub error ${r.status}`);
        }
        const d = (await r.json()) as GitHubCommit[];
        pages.push(...d);
        if (d.length < 100) break;
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

      // 2. Fetch repo and branches
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: h });
      const repoData = repoRes.ok ? ((await repoRes.json()) as GitHubRepo) : {};
      const defaultBranch = repoData.default_branch || 'main';

      const brRes = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers: h });
      const branches = brRes.ok ? ((await brRes.json()) as GitHubBranch[]) : [];

      // 3. Map branches to commits (Feature branches take priority over main)
      // Using Compare API to get ONLY unique commits per branch
      const brMap: Record<string, string> = {};

      await Promise.allSettled(
        branches
          .filter((b) => b.name !== defaultBranch)
          .slice(0, 15) // Limit to avoid hitting rate limits
          .map(async (b) => {
            try {
              // Compare API: gives commits in branch but NOT in default branch
              const r = await fetch(
                `https://api.github.com/repos/${repo}/compare/${defaultBranch}...${b.name}`,
                { headers: h }
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
      const phases = buildPhases(enriched);


      // 6. Calculate stats
      const types: Record<CommitType, number> = {
        feat: 0,
        fix: 0,
        refactor: 0,
        docs: 0,
        chore: 0,
        other: 0
      };
      enriched.forEach(c => {
        types[c.type] = (types[c.type] || 0) + 1;
      });

      const contribs = [...new Set(enriched.map(c => c.author))];
      
      const firstDate = new Date(enriched[0].date).getTime();
      const lastDate = new Date(enriched[enriched.length - 1].date).getTime();
      const totalDays = Math.max(Math.round(Math.abs(lastDate - firstDate) / 86400000), 1);

      setData({
        commits: enriched,
        phases,
        types,
        contribs,
        totalDays
      });
      
      // Save repo to localStorage for convenience
      localStorage.setItem('gitmap_repo', repo);

    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { ...data, loading, error, generate };
}
