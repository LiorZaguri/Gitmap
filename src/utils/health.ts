import type { Commit, Phase } from '../types';

export function calculateHealth(commits: Commit[], phases: Phase[]) {
  if (!phases || phases.length === 0) {
    return {
      score: 0,
      activity: 0,
      stability: 0,
      freshness: 0,
      collaboration: 0,
      velocity: 0,
      contributors: 0,
      daysSinceLast: 0,
      stablePhases: 0,
      totalPhases: 0
    };
  }
  if (commits.length === 0) {
    return {
      score: 0,
      activity: 0,
      stability: 0,
      freshness: 0,
      collaboration: 0,
      velocity: 0,
      contributors: 0,
      daysSinceLast: 0,
      stablePhases: 0,
      totalPhases: phases.length
    };
  }

  // 1. Velocity: Commits per week (max 50 for 100% score)
  const firstDate = new Date(commits[0].date).getTime();
  const lastDate = new Date(commits[commits.length - 1].date).getTime();
  const weeks = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24 * 7), 1);
  const velocity = commits.length / weeks;
  const activity = Math.min((velocity / 25) * 100, 100);

  // 2. Stability: Percentage of non-abandoned phases
  const abandonedPhases = phases.filter(p => p.status === 'abandoned').length;
  const stablePhases = phases.length - abandonedPhases;
  const stability = (stablePhases / phases.length) * 100;

  // 3. Freshness: Recent activity gets higher scores
  const now = Date.now();
  const daysSinceLast = Math.max((now - lastDate) / 86400000, 0);
  const freshness = daysSinceLast <= 7
    ? 100
    : Math.max(0, 100 - ((daysSinceLast - 7) / 53) * 100);

  // 4. Collaboration: More contributors imply healthier collaboration
  const contributors = new Set(commits.map(c => c.author)).size;
  const collaboration = Math.min((contributors / 4) * 100, 100);

  const totalScore = (activity + stability + freshness + collaboration) / 4;
  
  return {
    score: Math.round(totalScore),
    activity: Math.round(activity),
    stability: Math.round(stability),
    freshness: Math.round(freshness),
    collaboration: Math.round(collaboration),
    velocity: Math.round(velocity * 10) / 10,
    contributors,
    daysSinceLast: Math.round(daysSinceLast),
    stablePhases,
    totalPhases: phases.length
  };
}
