import { parseAxisPerformanceQuery } from '../../../../lib/forecast/axis-performance-query';

const parse = (query: string) => parseAxisPerformanceQuery(new URLSearchParams(query));

describe('parseAxisPerformanceQuery', () => {
  it('省略時は DIR / 90d / ALL', () => {
    expect(parse('')).toEqual({
      ok: true,
      query: { question: 'DIR', period: '90d', market: 'ALL' },
    });
  });

  it('指定値をそのまま返す', () => {
    expect(parse('question=MKT&period=all&market=JP')).toEqual({
      ok: true,
      query: { question: 'MKT', period: 'all', market: 'JP' },
    });
  });

  it.each([
    ['question=XXX', 'INVALID_QUESTION'],
    ['period=7d', 'INVALID_PERIOD'],
    ['market=EU', 'INVALID_MARKET'],
    ['question=MKT&market=ALL', 'MARKET_ALL_NOT_ALLOWED'],
    ['question=MKT', 'MARKET_ALL_NOT_ALLOWED'],
  ])('%s は %s', (query, error) => {
    expect(parse(query)).toEqual({ ok: false, error });
  });
});
