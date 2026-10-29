import { describe, expect, it } from 'vitest';
import { countByRisk, filterByRisk, isStale, ratedLevels, reviewModeFrom, sortFindings, STALE_MINUTES, type Risk } from '@/lib/contract-review-shared';

const f = (idx: number, risk: Risk) => ({ idx, risk });

describe('reviewModeFrom', () => {
  it('is off unless a backend is chosen', () => {
    expect(reviewModeFrom({})).toBe('off');
    expect(reviewModeFrom({ backend: 'off' })).toBe('off');
    expect(reviewModeFrom({ backend: 'bogus' })).toBe('off');
  });
  it('allows mock outside production only', () => {
    expect(reviewModeFrom({ backend: 'mock' })).toBe('mock');
    expect(reviewModeFrom({ backend: ' MOCK ', appEnv: 'dev' })).toBe('mock');
    expect(reviewModeFrom({ backend: 'mock', appEnv: 'prod' })).toBe('off');
  });
  it('needs both the URL and the key for http', () => {
    expect(reviewModeFrom({ backend: 'http' })).toBe('off');
    expect(reviewModeFrom({ backend: 'http', url: 'https://r.example' })).toBe('off');
    expect(reviewModeFrom({ backend: 'http', url: 'https://r.example', key: 'k', appEnv: 'prod' })).toBe('http');
  });
});

describe('reviewModeFrom — pnc (company chat API)', () => {
  const on = { backend: 'pnc', pncEnabled: 'true', pncUrl: 'https://kb.example/chat', pncKey: 'k' };
  it('needs the PNC switch, URL and key', () => {
    expect(reviewModeFrom(on)).toBe('pnc');
    expect(reviewModeFrom({ ...on, pncEnabled: 'false' })).toBe('off');
    expect(reviewModeFrom({ ...on, pncEnabled: undefined })).toBe('off');
    expect(reviewModeFrom({ ...on, pncUrl: '' })).toBe('off');
    expect(reviewModeFrom({ ...on, pncKey: undefined })).toBe('off');
  });
  it('reads the switch like the AI service does and is allowed in production', () => {
    expect(reviewModeFrom({ ...on, pncEnabled: ' TRUE ' })).toBe('pnc');
    expect(reviewModeFrom({ ...on, pncEnabled: '1' })).toBe('pnc');
    expect(reviewModeFrom({ ...on, appEnv: 'prod' })).toBe('pnc');
  });
  it('ignores the review service settings of the http backend', () => {
    expect(reviewModeFrom({ backend: 'pnc', url: 'https://r.example', key: 'k' })).toBe('off');
  });
});

describe('unrated findings (pnc)', () => {
  it('sort after every level, in contract order', () => {
    const list = [f(0, 'unrated'), f(1, 'none'), f(2, 'unrated'), f(3, 'high')];
    expect(sortFindings(list).map((x) => x.idx)).toEqual([3, 1, 0, 2]);
    expect(sortFindings([f(2, 'unrated'), f(0, 'unrated'), f(1, 'unrated')]).map((x) => x.idx)).toEqual([0, 1, 2]);
  });
  it('are counted on their own, never as "none"', () => {
    expect(countByRisk([f(0, 'unrated'), f(1, 'unrated'), f(2, 'none')])).toEqual({ high: 0, medium: 0, low: 0, none: 1, unrated: 2 });
  });
  it('hide the level filter when nothing has a level, and never offer unrated as a level', () => {
    expect(ratedLevels([f(0, 'unrated'), f(1, 'unrated')])).toEqual([]);
    expect(ratedLevels([])).toEqual([]);
    expect(ratedLevels([f(0, 'unrated'), f(1, 'low')])).toEqual(['high', 'medium', 'low', 'none']);
  });
  it('are shown by the "all" filter only', () => {
    const list = [f(0, 'unrated'), f(1, 'high')];
    expect(filterByRisk(list, null)).toHaveLength(2);
    expect(filterByRisk(list, 'none')).toHaveLength(0);
  });
});

describe('findings helpers', () => {
  const list = [f(0, 'none'), f(1, 'low'), f(2, 'high'), f(3, 'medium'), f(4, 'high')];
  it('sorts by risk, then contract order, without touching the input', () => {
    expect(sortFindings(list).map((x) => x.idx)).toEqual([2, 4, 3, 1, 0]);
    expect(list[0].idx).toBe(0);
  });
  it('filters by level (null = all)', () => {
    expect(filterByRisk(list, 'high').map((x) => x.idx)).toEqual([2, 4]);
    expect(filterByRisk(list, null)).toHaveLength(5);
  });
  it('counts each level', () => {
    expect(countByRisk(list)).toEqual({ high: 2, medium: 1, low: 1, none: 1, unrated: 0 });
  });
  it('treats a review without an outcome after the limit as lost', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(isStale('2026-10-01T11:55:00Z', now)).toBe(false);
    expect(isStale(new Date(now - (STALE_MINUTES + 1) * 60_000).toISOString(), now)).toBe(true);
  });
});
