import { toComparableTableSchema } from '../../../src/testing/dynamodb-local';

describe('toComparableTableSchema', () => {
  it('KeySchema はそのままの順序で正規化する（PK/SKの並びは意味を持つため並び替えない）', () => {
    const result = toComparableTableSchema({
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });

    expect(result.KeySchema).toEqual([
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ]);
  });

  it('AttributeDefinitions を AttributeName 順にソートする（入力の順序に依らない）', () => {
    const result = toComparableTableSchema({
      AttributeDefinitions: [
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
      ],
    });

    expect(result.AttributeDefinitions).toEqual([
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ]);
  });

  it('GlobalSecondaryIndexes を IndexName 順にソートする（入力の順序に依らない）', () => {
    const result = toComparableTableSchema({
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI2',
          KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI1',
          KeySchema: [{ AttributeName: 'GSI1PK', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });

    expect(result.GlobalSecondaryIndexes.map((gsi) => gsi.IndexName)).toEqual(['GSI1', 'GSI2']);
  });

  it('各GSIの Projection.NonKeyAttributes を名前順にソートする（入力の順序に依らない）', () => {
    const result = toComparableTableSchema({
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI2',
          KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: ['Trigger', 'CreatedAt', 'DetectedPattern'],
          },
        },
      ],
    });

    expect(result.GlobalSecondaryIndexes[0].Projection).toEqual({
      ProjectionType: 'INCLUDE',
      NonKeyAttributes: ['CreatedAt', 'DetectedPattern', 'Trigger'],
    });
  });

  it('NonKeyAttributes が無いGSI（KEYS_ONLY/ALL）では、正規化後も NonKeyAttributes プロパティを持たない', () => {
    const result = toComparableTableSchema({
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [{ AttributeName: 'GSI1PK', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
      ],
    });

    expect(result.GlobalSecondaryIndexes[0].Projection).toEqual({ ProjectionType: 'KEYS_ONLY' });
    expect('NonKeyAttributes' in result.GlobalSecondaryIndexes[0].Projection).toBe(false);
  });

  it('欠損したトップレベルフィールドは空配列・空文字に正規化され、例外を投げない', () => {
    const result = toComparableTableSchema({});

    expect(result).toEqual({
      KeySchema: [],
      AttributeDefinitions: [],
      GlobalSecondaryIndexes: [],
      BillingMode: '',
    });
  });

  it('構造は同じだが並び順だけが異なる2つの入力を、同じ正規形に変換する（ドリフトガードの核心）', () => {
    const a = toComparableTableSchema({
      AttributeDefinitions: [
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: ['CreatedAt', 'DetectedPattern'],
          },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });

    const b = toComparableTableSchema({
      AttributeDefinitions: [
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: ['DetectedPattern', 'CreatedAt'],
          },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });

    expect(a).toEqual(b);
  });

  it('GSIの属性名やProjectionTypeが実際に異なる場合は、正規化後も異なると判定できる（誤検知しない）', () => {
    const a = toComparableTableSchema({
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI2',
          KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'INCLUDE', NonKeyAttributes: ['CreatedAt'] },
        },
      ],
    });

    const b = toComparableTableSchema({
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI2',
          KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'INCLUDE', NonKeyAttributes: ['CreatedAt', 'UserID'] },
        },
      ],
    });

    expect(a).not.toEqual(b);
  });
});
