import { useState, useCallback } from 'react';
import type { Commit, Phase, CommitType } from '../types';
import { cls } from '../utils/classify';
import { buildPhases } from '../utils/phases';

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
      const pages: any[] = [];
      for (let p = 1; p <= 5; p++) {
        const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100&page=${p}`, { headers: h });
        if (!r.ok) {
          const e = await r.json();
          throw new Error(e.message || `GitHub error ${r.status}`);
        }
        const d = await r.json();
        pages.push(...d);
        if (d.length < 100) break;
      }

      // CRITICAL: Reverse so oldest commits come first
      pages.reverse();

      // 2. Fetch branches for mapping
      const br = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, { headers: h });
      const branches = br.ok ? await br.json() : [];

      // 3. Map branches to commits (limited to first 12 branches for performance)
      const brMap: Record<string, string> = {};
      await Promise.allSettled(branches.slice(0, 12).map(async (b: any) => {
        const r = await fetch(`https://api.github.com/repos/${repo}/commits?sha=${b.name}&per_page=50`, { headers: h });
        if (r.ok) {
          const bc = await r.json();
          bc.forEach((c: any) => {
            if (!brMap[c.sha]) brMap[c.sha] = b.name;
          });
        }
      }));

      // 4. Enrich commits with branch info and classify
      const enriched: Commit[] = pages.map(c => ({
        sha: c.sha,
        msg: c.commit.message.split('\n')[0],
        date: c.commit.author.date,
        author: c.commit.author.name,
        branch: brMap[c.sha] || 'main',
        type: cls(c.commit.message.split('\n')[0])
      }));

      // 5. Build phases from enriched commits
      const phases = buildPhases(enriched);

      // 6. Calculate stats
      const types: Record<CommitType, number> = {} as any;
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
      
      // Save to localStorage as requested
      localStorage.setItem('gitmap_repo', repo);
      localStorage.setItem('gitmap_token', token);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { ...data, loading, error, generate };
}
