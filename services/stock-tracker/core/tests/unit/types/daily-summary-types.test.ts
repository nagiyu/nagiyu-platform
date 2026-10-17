import type { DynamoDBItem } from '../../../src/types.js';

describe('DynamoDBItem 型定義', () => {
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
