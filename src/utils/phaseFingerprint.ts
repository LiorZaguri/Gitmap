import type { Commit, PhaseFingerprint, WorkItem } from '../types';

const TOP_LIMIT = 5;

export function buildPhaseFingerprint(workItems: WorkItem[], commits: Commit[]): PhaseFingerprint {
  const domains = countValues(workItems.flatMap(item => item.pathDomains));
  const topics = countTopicWeights(workItems);
  const labelsScopes = countValues(workItems.flatMap(item => [...item.labels, ...item.typesScopes]));
  const contributors = uniqueValues(workItems.flatMap(item => item.contributors));
  const releaseFlags = uniqueValues(workItems.flatMap(item => item.releaseFlags));

  const commitCount = commits.length;
  const startDate = commits[0]?.date ?? '';
  const endDate = commits[commits.length - 1]?.date ?? startDate;

  const dominantDomains = toRatioList(domains, TOP_LIMIT);
  const dominantTopics = toWeightedRatioList(topics, TOP_LIMIT);
  const dominantLabelsScopes = toRatioList(labelsScopes, TOP_LIMIT);

  const fallbackContribs = contributors.length > 0
    ? contributors
    : uniqueValues(commits.map(commit => commit.author));

  const namingConfidence = Math.max(
    dominantDomains[0]?.ratio ?? 0,
    dominantTopics[0]?.ratio ?? 0,
    dominantLabelsScopes[0]?.ratio ?? 0
  );

  return {
    dominantDomains,
    dominantTopics,
    dominantLabelsScopes,
    contributors: fallbackContribs,
    commitCount,
    startDate,
    endDate,
    releaseFlags,
    namingConfidence
  };
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach(value => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function countTopicWeights(workItems: WorkItem[]) {
  const weights = new Map<string, number>();
  workItems.forEach(item => {
    item.topicTokens.forEach(token => {
      weights.set(token.token, (weights.get(token.token) || 0) + token.weight);
    });
  });
  return weights;
}

function toRatioList(counts: Map<string, number>, limit: number) {
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      ratio: total > 0 ? count / total : 0
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    })
    .slice(0, limit);
}

function toWeightedRatioList(counts: Map<string, number>, limit: number) {
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(counts.entries())
    .map(([token, weight]) => ({
      token,
      weight,
      ratio: total > 0 ? weight / total : 0
    }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.token.localeCompare(b.token);
    })
    .slice(0, limit);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
