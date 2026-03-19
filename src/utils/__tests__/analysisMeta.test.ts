import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../analysisMeta';

describe('computeConfidence', () => {
  it('returns high when no limits hit', () => {
    expect(computeConfidence(false, false)).toEqual({ partial: false, confidence: 'high' });
  });

  it('returns medium when one limit is hit', () => {
    expect(computeConfidence(true, false)).toEqual({ partial: true, confidence: 'medium' });
  });

  it('returns low when both limits are hit', () => {
    expect(computeConfidence(true, true)).toEqual({ partial: true, confidence: 'low' });
  });
});
