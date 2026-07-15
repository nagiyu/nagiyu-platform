import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { batchDeleteItems, queryItemsByPrefix } from '../../../src/migration/dynamo-helpers.js';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';

const TABLE = 'nagiyu-livetalk-test';

function makeDocClient(mockSend: jest.Mock) {
  return { send: mockSend } as unknown as DynamoDBDocumentClient;
}

const noopSleep = () => Promise.resolve();

describe('queryItemsByPrefix', () => {
  it('Query 失敗時は DatabaseError でラップして throw する', async () => {
    const mockSend = jest.fn().mockRejectedValueOnce(new Error('boom'));
    await expect(
      queryItemsByPrefix(makeDocClient(mockSend), TABLE, 'PK', 'SK#')
    ).rejects.toThrow(DatabaseError);
  });
});

describe('batchDeleteItems', () => {
  const makeItems = (n: number): DynamoDBItem[] =>
    Array.from({ length: n }, (_, i) => ({
      PK: 'PK',
      SK: `SK#${i}`,
      Type: 'x',
      CreatedAt: 1,
      UpdatedAt: 1,
    }));

  it('空配列なら send を呼ばず 0 を返す', async () => {
    const mockSend = jest.fn();
    const result = await batchDeleteItems(makeDocClient(mockSend), TABLE, [], noopSleep);
    expect(result).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('26 件は 2 バッチ（25+1）に分割して削除する', async () => {
    const mockSend = jest.fn().mockResolvedValue({});
    const result = await batchDeleteItems(makeDocClient(mockSend), TABLE, makeItems(26), noopSleep);
    expect(result).toBe(26);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('UnprocessedItems が残る場合は指数バックオフでリトライして完了する', async () => {
    const items = makeItems(2);
    const mockSend = jest
      .fn()
      .mockResolvedValueOnce({
        UnprocessedItems: {
          [TABLE]: [{ DeleteRequest: { Key: { PK: 'PK', SK: 'SK#1' } } }],
        },
      })
      .mockResolvedValueOnce({});

    const result = await batchDeleteItems(makeDocClient(mockSend), TABLE, items, noopSleep);
    expect(result).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('最大リトライ回数を超えて UnprocessedItems が残る場合は DatabaseError を throw する', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      UnprocessedItems: {
        [TABLE]: [{ DeleteRequest: { Key: { PK: 'PK', SK: 'SK#0' } } }],
      },
    });

    await expect(
      batchDeleteItems(makeDocClient(mockSend), TABLE, makeItems(1), noopSleep)
    ).rejects.toThrow(DatabaseError);
  });

  it('BatchWrite 送信自体が失敗した場合は DatabaseError でラップする', async () => {
    const mockSend = jest.fn().mockRejectedValueOnce(new Error('boom'));
    await expect(
      batchDeleteItems(makeDocClient(mockSend), TABLE, makeItems(1), noopSleep)
    ).rejects.toThrow(DatabaseError);
  });
});
