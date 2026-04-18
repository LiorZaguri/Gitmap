import { useState, useCallback } from 'react';
import type { Commit, Phase, CommitType, AnalysisMeta, WorkItem } from '../types';
import { cls } from '../utils/classify';
import { buildPhases } from '../utils/phases';
import { fetchGitHubSnapshot, fetchMergeCommitHints, fetchCommitPathDomains, fetchPullRequestMetadata, fetchTagOrRelease, type PullRequestMeta, type ReleaseMeta } from '../utils/github';
import { computeConfidence } from '../utils/analysisMeta';
import { calculateHistoryQuality } from '../utils/historyQuality';
import { buildWorkItems } from '../utils/workItems';

const COMMITS_PER_PAGE = 100;
const MAX_PAGES = 5;
const MAX_BRANCHES = 15;
const MAX_COMMITS = COMMITS_PER_PAGE * MAX_PAGES;

export function useGitHub() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [data, setData] = useState<{
    repo: string;
    commits: Commit[];
    workItems: WorkItem[];
    phases: Phase[];
    types: Record<CommitType, number>;
    contribs: string[];
    totalDays: number;
    analysis: AnalysisMeta;
    historyQuality?: import('../types').HistoryQuality;
  } | null>(null);

  const generate = useCallback(async (repo: string, token: string) => {
    setLoading(true);
    setError(null);
    const tokenValue = token.trim();
    const hasToken = tokenValue.length > 0;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (hasToken) headers.Authorization = `token ${tokenValue}`;

    try {
      const snapshot = await fetchGitHubSnapshot(repo, headers, hasToken, {
        commitsPerPage: COMMITS_PER_PAGE,
        maxPages: MAX_PAGES,
        maxBranches: MAX_BRANCHES
      }, setLoadingStage);
      const { commits: pages, defaultBranch, branchMap, hitCommitLimit, hitBranchLimit, branchesCompared } = snapshot;

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
      if (validCommits.length === 0) {
        throw new Error('Repo has no commits to analyze.');
      }

      // 4. Enrich commits with branch info and classify
      const enriched: Commit[] = validCommits.map(c => ({
        sha: c.sha,
        msg: c.commit.message.split('\n')[0],
        fullMessage: c.commit.message,
        body: c.commit.message.split('\n').slice(1).join('\n').trim() || undefined,
        date: c.commit.author.date,
        author: c.commit.author.name,
        branch: branchMap[c.sha] || defaultBranch,
        type: cls(c.commit.message.split('\n')[0])
      }));

      // CRITICAL: GitHub returns newest-first; reverse so oldest commits come first
      enriched.reverse();

      const firstDate = new Date(enriched[0].date).getTime();
      const lastDate = new Date(enriched[enriched.length - 1].date).getTime();
      const totalDays = Math.max(Math.round(Math.abs(lastDate - firstDate) / 86400000), 1);

      let boundaryHints: number[] = [];
      let pathDomains: Record<string, string> = {};
      let pullRequests: Record<string, PullRequestMeta> = {};
      let releaseMeta: ReleaseMeta | null = null;
      if (enriched.length >= 200 && totalDays >= 60) {
        boundaryHints = await fetchMergeCommitHints(
          repo,
          headers,
          enriched.map(c => ({ sha: c.sha, msg: c.msg }))
        );
      }
      if (enriched.length >= 150 || totalDays >= 90) {
        pathDomains = await fetchCommitPathDomains(
          repo,
          headers,
          enriched.map(c => ({ sha: c.sha, msg: c.msg }))
        );
      }
      if (enriched.length >= 150 || totalDays >= 90) {
        setLoadingStage('Fetching PR context');
        try {
          pullRequests = await fetchPullRequestMetadata(
            repo,
            headers,
            enriched.map(c => ({ sha: c.sha, msg: c.msg }))
          );
        } catch (err) {
          console.warn('Failed to fetch PR metadata:', err);
          pullRequests = {};
        }
      }
      setLoadingStage('Fetching release context');
      try {
        releaseMeta = await fetchTagOrRelease(repo, headers);
      } catch (err) {
        console.warn('Failed to fetch release metadata:', err);
        releaseMeta = null;
      }

      // 5. Build work items before phases
      const workItems = buildWorkItems(enriched, pullRequests, { windowSize: 4, pathDomains, releaseMeta });

      // 6. Build phases from enriched commits
      setLoadingStage('Analyzing phases');
      const { phases, grouping, roadmapConfidence } = buildPhases(enriched, { boundaryHints, pathDomains, pullRequests, workItems });


      // 7. Calculate stats
      setLoadingStage('Building insights');
      const types: Record<CommitType, number> = {
        feat: 0,
        fix: 0,
        perf: 0,
        refactor: 0,
        docs: 0,
        test: 0,
        ci: 0,
        build: 0,
        style: 0,
        chore: 0,
        unknown: 0
      };
      enriched.forEach(c => {
        types[c.type] = (types[c.type] || 0) + 1;
      });

      const contribs = [...new Set(enriched.map(c => c.author))];
      
      const { partial, confidence } = computeConfidence(hitCommitLimit, hitBranchLimit);
      const historyQuality = calculateHistoryQuality(enriched, phases, workItems);

      setData({
        repo,
        commits: enriched,
        workItems,
        phases,
        types,
        contribs,
        totalDays,
        historyQuality,
        analysis: {
          commitsAnalyzed: enriched.length,
          branchesCompared,
          hitCommitLimit,
          hitBranchLimit,
          maxCommits: MAX_COMMITS,
          maxBranches: MAX_BRANCHES,
          partial,
          confidence,
          roadmapConfidence,
          historyQuality,
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
