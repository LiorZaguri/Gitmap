import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAssociatedPullRequests } from '../github';

describe('github helpers', () => {
  const headers = { Accept: 'application/json' };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('maps associated pull requests for a commit', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { number: 12, title: 'Fix cache', body: 'details', merged_at: '2025-01-01T00:00:00Z' }
      ])
    } as Response);

    const result = await fetchAssociatedPullRequests('owner/repo', headers, 'sha123');
    expect(result).toEqual([
      { number: 12, title: 'Fix cache', body: 'details', mergedAt: '2025-01-01T00:00:00Z' }
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns empty list on non-ok response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    const result = await fetchAssociatedPullRequests('owner/repo', headers, 'sha123');
    expect(result).toEqual([]);
  });
});
