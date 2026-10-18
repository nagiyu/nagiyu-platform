/**
 * Stock Tracker Core - ExchangeSummaryIndex (GSI4) ソートキー Unit Tests
 */

import {
  buildExchangeSummaryGsi4DatePrefix,
  buildExchangeSummaryGsi4DateUpperBound,
  buildExchangeSummaryGsi4Sk,
} from '../../../src/mappers/exchange-summary-index.js';

describe('ExchangeSummaryIndex のソートキー', () => {
  it('GSI4SK は日付とティッカーIDから作る', () => {
    expect(buildExchangeSummaryGsi4Sk('2026-02-27', 'NSDQ:AAPL')).toBe('DATE#2026-02-27#NSDQ:AAPL');
  });

  it('日付の接頭辞は、その日の GSI4SK すべてに前方一致する', () => {
    const prefix = buildExchangeSummaryGsi4DatePrefix('2026-02-27');

    expect(prefix).toBe('DATE#2026-02-27');
    expect(buildExchangeSummaryGsi4Sk('2026-02-27', 'NSDQ:AAPL').startsWith(prefix)).toBe(true);
    expect(buildExchangeSummaryGsi4Sk('2026-02-28', 'NSDQ:AAPL').startsWith(prefix)).toBe(false);
  });

  it('範囲の下限は、その日の GSI4SK 以下になる', () => {
    expect(
      buildExchangeSummaryGsi4DatePrefix('2026-02-27') <=
        buildExchangeSummaryGsi4Sk('2026-02-27', 'AAAA:AAAA')
    ).toBe(true);
  });

  it('範囲の上限は、その日のティッカーIDによらず GSI4SK より大きく、翌日の GSI4SK より小さい', () => {
    const upper = buildExchangeSummaryGsi4DateUpperBound('2026-02-27');

    expect(upper).toBe('DATE#2026-02-27#~');
    expect(upper > buildExchangeSummaryGsi4Sk('2026-02-27', 'TSE:7203')).toBe(true);
    expect(upper > buildExchangeSummaryGsi4Sk('2026-02-27', 'ZZZZ:ZZZZ')).toBe(true);
    expect(upper < buildExchangeSummaryGsi4Sk('2026-02-28', 'AAAA:AAAA')).toBe(true);
  });
});
