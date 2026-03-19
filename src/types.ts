export type CommitType = 'feat' | 'fix' | 'refactor' | 'docs' | 'test' | 'ci' | 'chore' | 'unknown';

export interface Commit {
  sha: string;
  msg: string;
  date: string;
  author: string;
  branch: string;
  type: CommitType;
}

export type WorkItemKind = 'pull_request' | 'commit_window';

export interface WorkItem {
  kind: WorkItemKind;
  title: string;
  bodySummary?: string;
  commitShas: string[];
  changedFiles: string[];
  pathDomains: string[];
  labels: string[];
  typesScopes: string[];
  contributors: string[];
  startDate: string;
  endDate: string;
  releaseFlags: string[];
  sourceBranchHint?: string;
  confidence: number;
}

export type PhaseStatus = 'active' | 'done' | 'abandoned';

export interface Phase {
  name: string;
  branch: string;
  items: Commit[];
  start: string;
  end: string;
  color: string;
  status: PhaseStatus;
  idx: number;
}

export interface AnalysisMeta {
  commitsAnalyzed: number;
  branchesCompared: number;
  hitCommitLimit: boolean;
  hitBranchLimit: boolean;
  maxCommits: number;
  maxBranches: number;
  partial: boolean;
  confidence: 'high' | 'medium' | 'low';
  groupingMode: 'branch' | 'time-gap';
  groupingLabel: 'branch' | 'time-gap' | 'mixed';
  branchRatio: number;
}
