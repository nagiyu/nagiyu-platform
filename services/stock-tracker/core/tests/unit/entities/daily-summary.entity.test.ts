import type {
  DailySummaryEntity,
  CreateDailySummaryInput,
  DailySummaryKey,
} from '../../../src/entities/daily-summary.entity.js';
import type {
  DailySummaryEntity as DailySummaryEntityFromIndex,
  CreateDailySummaryInput as CreateDailySummaryInputFromIndex,
  DailySummaryKey as DailySummaryKeyFromIndex,
} from '../../../src/index.js';

describe('DailySummaryEntity 型定義', () => {
  it('DailySummaryEntity の必須フィールドを保持できる', () => {
    const entity: DailySummaryEntity = {
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Date: '2026-02-27',
      Open: 100,
      High: 110,
      Low: 90,
      Close: 105,
      CreatedAt: 1700000000000,
      UpdatedAt: 1700000000000,
    };

    expect(entity.Date).toBe('2026-02-27');
    expect(entity.Close).toBe(105);
  });

  it('CreateDailySummaryInput が CreatedAt/UpdatedAt を含まない入力を保持できる', () => {
    const input: CreateDailySummaryInput = {
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Date: '2026-02-27',
      Open: 100,
      High: 110,
      Low: 90,
      Close: 105,
    };

    expect(input.TickerID).toBe('NSDQ:AAPL');
    expect(input.High).toBe(110);
  });

  it('DailySummaryKey が tickerId/date を保持できる', () => {
    const key: DailySummaryKey = {
      tickerId: 'NSDQ:AAPL',
      date: '2026-02-27',
    };

    expect(key.tickerId).toBe('NSDQ:AAPL');
    expect(key.date).toBe('2026-02-27');
  });
});

describe('index.ts の DailySummary 型エクスポート', () => {
  it('index.ts から DailySummary 関連型を参照できる', () => {
    const entity: DailySummaryEntityFromIndex = {
      TickerID: 'NSDQ:NVDA',
      ExchangeID: 'NASDAQ',
      Date: '2026-02-28',
      Open: 200,
      High: 220,
      Low: 195,
      Close: 210,
      CreatedAt: 1700000000000,
      UpdatedAt: 1700000000000,
    };
    const input: CreateDailySummaryInputFromIndex = {
      TickerID: 'NSDQ:NVDA',
      ExchangeID: 'NASDAQ',
      Date: '2026-02-28',
      Open: 200,
      High: 220,
      Low: 195,
      Close: 210,
    };
    const key: DailySummaryKeyFromIndex = {
      tickerId: 'NSDQ:NVDA',
      date: '2026-02-28',
    };

    expect(entity.TickerID).toBe('NSDQ:NVDA');
    expect(input.Close).toBe(210);
    expect(key.date).toBe('2026-02-28');
  });
});
