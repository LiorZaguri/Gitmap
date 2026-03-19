import type { Commit, Phase } from '../types';

export function calculateHealth(commits: Commit[], phases: Phase[]) {
  if (commits.length === 0) return 0;

  // 1. Velocity: Commits per week (max 50 for 100% score)
  const firstDate = new Date(commits[0].date).getTime();
  const lastDate = new Date(commits[commits.length - 1].date).getTime();
  const weeks = Math.max((lastDate - firstDate) / (1000 * 60 * 60 * 24 * 7), 1);
  const velocity = commits.length / weeks;
  const velocityScore = Math.min((velocity / 50) * 100, 100);

  // 2. Phase Health: Percentage of non-abandoned phases
  const abandonedPhases = phases.filter(p => p.status === 'abandoned').length;
  const phaseScore = ((phases.length - abandonedPhases) / phases.length) * 100;

  // 3. Fix vs Feat Ratio: Ideal is < 20% fixes
  const fixes = commits.filter(c => c.type === 'fix').length;
  const fixRatio = fixes / commits.length;
  const fixScore = Math.max(100 - (fixRatio * 200), 0); // 50% fixes = 0 score

  // Weighted average
  const totalScore = (velocityScore * 0.4) + (phaseScore * 0.4) + (fixScore * 0.2);
  
  return {
    score: Math.round(totalScore),
    velocity: Math.round(velocity * 10) / 10,
    fixRatio: Math.round(fixRatio * 100)
  };
}
