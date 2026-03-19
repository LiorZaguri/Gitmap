export type CommitType = 'feat' | 'fix' | 'refactor' | 'docs' | 'chore' | 'other';

export interface Commit {
  sha: string;
  msg: string;
  date: string;
  author: string;
  branch: string;
  type: CommitType;
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
}
