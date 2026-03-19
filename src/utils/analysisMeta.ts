export function computeConfidence(hitCommitLimit: boolean, hitBranchLimit: boolean): { partial: boolean; confidence: 'high' | 'medium' | 'low' } {
  const partial = hitCommitLimit || hitBranchLimit;
  const confidence: 'high' | 'medium' | 'low' = !partial ? 'high' : (hitCommitLimit && hitBranchLimit ? 'low' : 'medium');
  return { partial, confidence };
}
