import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  batchGetAll,
  batchWriteAll,
  BatchRetryExhaustedError,
} from '../../../src/dynamodb/batch.js';

const TABLE = 'tbl';
const put = (n: number) => ({ PutRequest: { Item: { PK: `P#${n}`, SK: `S#${n}` } } });
const key = (n: number) => ({ PK: `P#${n}`, SK: `S#${n}` });

describe('batch', () => {
  let send: jest.Mock;
  let sleep: jest.Mock;
  let docClient: DynamoDBDocumentClient;

  beforeEach(() => {
    send = jest.fn();
    sleep = jest.fn().mockResolvedValue(undefined);
    docClient = { send } as unknown as DynamoDBDocumentClient;
  });

  describe('batchWriteAll', () => {
    it('空配列では send せず 0 を返す', async () => {
      expect(await batchWriteAll(docClient, TABLE, [], { sleep })).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });

    it('25 件ずつに分割し、入力は RequestItems のみとなる', async () => {
      send.mockResolvedValue({});
      const requests = Array.from({ length: 60 }, (_, i) => put(i));

      const count = await batchWriteAll(docClient, TABLE, requests, { sleep });

      expect(count).toBe(60);
      expect(send).toHaveBeenCalledTimes(3);
      expect(send.mock.calls[0][0].input).toStrictEqual({
        RequestItems: { [TABLE]: requests.slice(0, 25) },
      });
      expect(send.mock.calls[2][0].input.RequestItems[TABLE]).toHaveLength(10);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('未処理分をそのまま再送し、処理済み件数を累計する', async () => {
      const requests = [put(1), put(2), put(3)];
      send
        .mockResolvedValueOnce({ UnprocessedItems: { [TABLE]: [requests[1], requests[2]] } })
        .mockResolvedValueOnce({ UnprocessedItems: { [TABLE]: [requests[2]] } })
        .mockResolvedValueOnce({});

      const count = await batchWriteAll(docClient, TABLE, requests, { sleep });

      expect(count).toBe(3);
      expect(send.mock.calls[1][0].input.RequestItems[TABLE]).toEqual([requests[1], requests[2]]);
      expect(send.mock.calls[2][0].input.RequestItems[TABLE]).toEqual([requests[2]]);
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100]);
    });

    it('baseDelayMs を指定できる', async () => {
      send
        .mockResolvedValueOnce({ UnprocessedItems: { [TABLE]: [put(1)] } })
        .mockResolvedValueOnce({});

      await batchWriteAll(docClient, TABLE, [put(1)], { sleep, baseDelayMs: 10 });

      expect(sleep).toHaveBeenCalledWith(10);
    });

    it('上限を超えて未処理が残れば例外を投げ、待機は 50/100/200/400ms となる', async () => {
      send.mockResolvedValue({ UnprocessedItems: { [TABLE]: [put(1), put(2)] } });

      const error = await batchWriteAll(docClient, TABLE, [put(1), put(2)], { sleep }).catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(BatchRetryExhaustedError);
      expect((error as BatchRetryExhaustedError).remaining).toBe(2);
      expect((error as Error).message).toBe(
        'UnprocessedItems が最大リトライ回数（4）後も残存しました（残 2 件）'
      );
      expect(send).toHaveBeenCalledTimes(5);
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100, 200, 400]);
    });

    it('SDK の例外は包まずそのまま伝播する', async () => {
      const sdkError = new Error('throttled');
      send.mockRejectedValue(sdkError);

      await expect(batchWriteAll(docClient, TABLE, [put(1)], { sleep })).rejects.toBe(sdkError);
    });
  });

  describe('batchGetAll', () => {
    it('空配列では send せず空配列を返す', async () => {
      expect(await batchGetAll(docClient, TABLE, [], { sleep })).toEqual([]);
      expect(send).not.toHaveBeenCalled();
    });

    it('100 件ずつに分割して結果を連結する', async () => {
      send
        .mockResolvedValueOnce({ Responses: { [TABLE]: [key(1)] } })
        .mockResolvedValueOnce({ Responses: { [TABLE]: [key(2)] } })
        .mockResolvedValueOnce({});
      const keys = Array.from({ length: 250 }, (_, i) => key(i));

      const items = await batchGetAll(docClient, TABLE, keys, { sleep });

      expect(items).toEqual([key(1), key(2)]);
      expect(send).toHaveBeenCalledTimes(3);
      expect(send.mock.calls[0][0].input).toStrictEqual({
        RequestItems: { [TABLE]: { Keys: keys.slice(0, 100) } },
      });
      expect(send.mock.calls[2][0].input.RequestItems[TABLE].Keys).toHaveLength(50);
    });

    it('未処理キーを再送し、応答を連結する', async () => {
      send
        .mockResolvedValueOnce({
          Responses: { [TABLE]: [key(1)] },
          UnprocessedKeys: { [TABLE]: { Keys: [key(2)] } },
        })
        .mockResolvedValueOnce({ Responses: { [TABLE]: [key(2)] } });

      const items = await batchGetAll(docClient, TABLE, [key(1), key(2)], { sleep });

      expect(items).toEqual([key(1), key(2)]);
      expect(send.mock.calls[1][0].input.RequestItems[TABLE].Keys).toEqual([key(2)]);
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([50]);
    });

    it('上限を超えて未処理が残れば例外を投げる', async () => {
      send.mockResolvedValue({ UnprocessedKeys: { [TABLE]: { Keys: [key(1)] } } });

      const error = await batchGetAll(docClient, TABLE, [key(1)], { sleep }).catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(BatchRetryExhaustedError);
      expect((error as BatchRetryExhaustedError).remaining).toBe(1);
      expect((error as Error).message).toBe(
        'UnprocessedKeys が最大リトライ回数（4）後も残存しました（残 1 件）'
      );
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100, 200, 400]);
    });

    it('SDK の例外は包まずそのまま伝播する', async () => {
      const sdkError = new Error('boom');
      send.mockRejectedValue(sdkError);

      await expect(batchGetAll(docClient, TABLE, [key(1)], { sleep })).rejects.toBe(sdkError);
    });
  });
});
