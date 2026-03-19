import { describe, it, expect } from 'vitest';
import { extractPathDomainSummary } from '../pathDomains';

describe('path domain extraction', () => {
  it('extracts dominant domain from monorepo roots', () => {
    const summary = extractPathDomainSummary([
      'packages/api/src/index.ts',
      'packages/api/src/routes.ts',
      'packages/web/src/app.tsx',
      'packages/api/test/spec.ts'
    ]);
    expect(summary.dominantDomain).toBe('packages/api');
    expect(summary.concentration).toBeGreaterThan(0.4);
  });

  it('normalizes noisy roots like src', () => {
    const summary = extractPathDomainSummary([
      'src/server/index.ts',
      'src/server/routes.ts',
      'src/client/app.tsx'
    ]);
    expect(summary.dominantDomain).toBe('server');
  });
});
