import { describe, expect, it } from 'vitest';
import { cls, parseConventionalHeader } from '../classify';

describe('classify', () => {
  it('parses conventional commit headers with scope and bang', () => {
    const parsed = parseConventionalHeader('feat(api)!: add auth flow');
    expect(parsed.type).toBe('feat');
    expect(parsed.scope).toBe('api');
    expect(parsed.subject).toBe('add auth flow');
  });

  it('maps common conventional and git-hygiene commit types', () => {
    expect(cls('perf(cache): reduce lookup cost')).toBe('perf');
    expect(cls('build: bump vite to latest')).toBe('build');
    expect(cls('docs(readme): update setup')).toBe('docs');
    expect(cls('test(api): cover webhook retries')).toBe('test');
    expect(cls('style: format imports')).toBe('style');
  });

  it('classifies non-conventional common prefixes', () => {
    expect(cls('Implement auth middleware')).toBe('feat');
    expect(cls('Fix failing deploy workflow')).toBe('fix');
    expect(cls('Merge branch feature/auth into main')).toBe('chore');
  });
});
