import { describe, it, expect } from 'vitest';
import { normalizeRepoInput } from '../normalizeRepo';

describe('normalizeRepoInput', () => {
  it('accepts owner/repo', () => {
    const result = normalizeRepoInput('owner/repo');
    expect(result).toEqual({ value: 'owner/repo', error: null });
  });

  it('accepts GitHub URLs', () => {
    const result = normalizeRepoInput('https://github.com/owner/repo/');
    expect(result).toEqual({ value: 'owner/repo', error: null });
  });

  it('rejects invalid input', () => {
    const result = normalizeRepoInput('not-a-repo');
    expect(result.error).toBeTruthy();
  });
});
