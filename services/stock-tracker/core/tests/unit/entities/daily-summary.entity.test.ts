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
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      date: '2026-02-27',
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1234567,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    expect(entity.date).toBe('2026-02-27');
    expect(entity.close).toBe(105);
    expect(entity.volume).toBe(1234567);
  });

  it('CreateDailySummaryInput が createdAt/updatedAt を含まない入力を保持できる', () => {
    const input: CreateDailySummaryInput = {
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      date: '2026-02-27',
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 7654321,
    };

    expect(input.tickerId).toBe('NSDQ:AAPL');
    expect(input.high).toBe(110);
    expect(input.volume).toBe(7654321);
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
      tickerId: 'NSDQ:NVDA',
      exchangeId: 'NASDAQ',
      date: '2026-02-28',
      open: 200,
      high: 220,
      low: 195,
      close: 210,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    const input: CreateDailySummaryInputFromIndex = {
      tickerId: 'NSDQ:NVDA',
      exchangeId: 'NASDAQ',
      date: '2026-02-28',
      open: 200,
      high: 220,
      low: 195,
      close: 210,
    };
    const key: DailySummaryKeyFromIndex = {
      tickerId: 'NSDQ:NVDA',
      date: '2026-02-28',
    };

    expect(entity.tickerId).toBe('NSDQ:NVDA');
    expect(input.close).toBe(210);
    expect(key.date).toBe('2026-02-28');
  });
});
