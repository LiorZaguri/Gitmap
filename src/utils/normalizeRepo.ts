export interface NormalizeRepoResult {
  value: string;
  error: string | null;
}

export function normalizeRepoInput(raw: string): NormalizeRepoResult {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return { value: '', error: 'Please enter a repository' };

  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  const value = urlMatch ? urlMatch[1] : trimmed;
  const valid = /^[\w.-]+\/[\w.-]+$/.test(value);
  if (!valid) return { value, error: 'Repo must be owner/repo or a GitHub URL' };
  return { value, error: null };
}
