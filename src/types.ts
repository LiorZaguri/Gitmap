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
  topicTokens: Array<{ token: string; weight: number }>;
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
  fingerprint?: PhaseFingerprint;
  nameSource?: PhaseNameSource;
}

export type PhaseNameSource = 'workstream' | 'domain' | 'label-scope' | 'topic' | 'fallback';

export interface PhaseFingerprint {
  dominantDomains: Array<{ value: string; count: number; ratio: number }>;
  dominantTopics: Array<{ token: string; weight: number; ratio: number }>;
  dominantLabelsScopes: Array<{ value: string; count: number; ratio: number }>;
  dominantWorkstreamTitles: Array<{ value: string; count: number; ratio: number }>;
  contributors: string[];
  commitCount: number;
  startDate: string;
  endDate: string;
  releaseFlags: string[];
  namingConfidence: number;
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
