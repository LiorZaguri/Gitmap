import { describe, it, expect } from 'vitest';
import { cls } from '../classify';

describe('cls', () => {
  it('classifies common commit prefixes', () => {
    expect(cls('feat: add search')).toBe('feat');
    expect(cls('fix: crash on load')).toBe('fix');
    expect(cls('docs: update readme')).toBe('docs');
    expect(cls('test: add unit coverage')).toBe('test');
    expect(cls('ci: setup workflow')).toBe('ci');
    expect(cls('chore: bump deps')).toBe('chore');
  });

  it('falls back to unknown', () => {
    expect(cls('')).toBe('unknown');
    expect(cls('misc improvements')).toBe('unknown');
  });
});
