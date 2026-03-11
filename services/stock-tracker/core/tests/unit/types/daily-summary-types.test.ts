import type { DailySummary, DynamoDBItem } from '../../../src/types.js';

describe('DailySummary 型定義', () => {
  it('DailySummary の必須フィールドを保持できる', () => {
    const summary: DailySummary = {
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Date: '2026-02-27',
      Open: 100.1,
      High: 110.2,
      Low: 95.3,
      Close: 108.4,
      Volume: 1234567,
      CreatedAt: 1700000000000,
      UpdatedAt: 1700000000000,
    };

    expect(summary.TickerID).toBe('NSDQ:AAPL');
    expect(summary.ExchangeID).toBe('NASDAQ');
    expect(summary.Date).toBe('2026-02-27');
    expect(summary.Open).toBe(100.1);
    expect(summary.High).toBe(110.2);
    expect(summary.Low).toBe(95.3);
    expect(summary.Close).toBe(108.4);
    expect(summary.Volume).toBe(1234567);
    expect(summary.CreatedAt).toBe(1700000000000);
    expect(summary.UpdatedAt).toBe(1700000000000);
  });

  it('DynamoDBItem で DailySummary と GSI4 フィールドを保持できる', () => {
    const item: DynamoDBItem = {
      PK: 'SUMMARY#NSDQ:AAPL',
      SK: 'DATE#2026-02-27',
      Type: 'DailySummary',
      GSI4PK: 'NASDAQ',
      GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
    };

    expect(item.Type).toBe('DailySummary');
    expect(item.GSI4PK).toBe('NASDAQ');
    expect(item.GSI4SK).toBe('DATE#2026-02-27#NSDQ:AAPL');
  });
});
