import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  queryPages,
  queryAllItems,
  scanAllItems,
  queryPage,
  scanPage,
} from '../../../src/dynamodb/pagination.js';
import { encodeCursor, decodeCursor } from '../../../src/dynamodb/cursor.js';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const item = (n: number) => ({ PK: `P#${n}`, SK: `S#${n}`, Type: 'T', CreatedAt: n, UpdatedAt: n });

describe('pagination', () => {
  let send: jest.Mock;
  let docClient: DynamoDBDocumentClient;

  beforeEach(() => {
    send = jest.fn();
    docClient = { send } as unknown as DynamoDBDocumentClient;
  });

  describe('queryAllItems', () => {
    it('単一ページを返し、ExclusiveStartKey キーを含めない', async () => {
      send.mockResolvedValueOnce({ Items: [item(1)] });
      const input = { TableName: 't', KeyConditionExpression: 'PK = :p' };

      const result = await queryAllItems(docClient, input);

      expect(result).toEqual([item(1)]);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].input).toStrictEqual(input);
      expect('ExclusiveStartKey' in send.mock.calls[0][0].input).toBe(false);
    });

    it('複数ページを連結し、前ページの LastEvaluatedKey を引き継ぐ', async () => {
      const key1 = { PK: 'P#1', SK: 'S#1' };
      const key2 = { PK: 'P#2', SK: 'S#2' };
      send
        .mockResolvedValueOnce({ Items: [item(1)], LastEvaluatedKey: key1 })
        .mockResolvedValueOnce({ Items: [item(2)], LastEvaluatedKey: key2 })
        .mockResolvedValueOnce({ Items: [item(3)] });

      const result = await queryAllItems(docClient, { TableName: 't' });

      expect(result).toEqual([item(1), item(2), item(3)]);
      expect('ExclusiveStartKey' in send.mock.calls[0][0].input).toBe(false);
      expect(send.mock.calls[1][0].input.ExclusiveStartKey).toBe(key1);
      expect(send.mock.calls[2][0].input.ExclusiveStartKey).toBe(key2);
    });

    it('Items が未定義のページは空配列として扱う', async () => {
      send.mockResolvedValueOnce({});

      expect(await queryAllItems(docClient, { TableName: 't' })).toEqual([]);
    });

    it('input に指定された ExclusiveStartKey から開始する', async () => {
      const start = { PK: 'P#0', SK: 'S#0' };
      send.mockResolvedValueOnce({ Items: [] });

      await queryAllItems(docClient, { TableName: 't', ExclusiveStartKey: start });

      expect(send.mock.calls[0][0].input.ExclusiveStartKey).toBe(start);
    });

    it('send の例外を同一インスタンスのまま伝播する', async () => {
      const error = new Error('失敗');
      send.mockRejectedValueOnce(error);

      await expect(queryAllItems(docClient, { TableName: 't' })).rejects.toBe(error);
    });
  });

  describe('queryPages', () => {
    it('ページごとに yield する', async () => {
      send
        .mockResolvedValueOnce({ Items: [item(1)], LastEvaluatedKey: { PK: 'a', SK: 'b' } })
        .mockResolvedValueOnce({ Items: [item(2)] });

      const pages: unknown[] = [];
      for await (const page of queryPages(docClient, { TableName: 't' })) {
        pages.push(page);
      }

      expect(pages).toEqual([[item(1)], [item(2)]]);
    });

    it('途中で break すると以降の send は呼ばれない', async () => {
      send.mockResolvedValue({ Items: [item(1)], LastEvaluatedKey: { PK: 'a', SK: 'b' } });

      for await (const page of queryPages(docClient, { TableName: 't' })) {
        expect(page).toHaveLength(1);
        break;
      }

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanAllItems', () => {
    it('複数ページの Scan を連結する', async () => {
      const key1 = { PK: 'P#1', SK: 'S#1' };
      send
        .mockResolvedValueOnce({ Items: [item(1)], LastEvaluatedKey: key1 })
        .mockResolvedValueOnce({ Items: [item(2)] });

      const result = await scanAllItems(docClient, { TableName: 't' });

      expect(result).toEqual([item(1), item(2)]);
      expect('ExclusiveStartKey' in send.mock.calls[0][0].input).toBe(false);
      expect(send.mock.calls[1][0].input.ExclusiveStartKey).toBe(key1);
    });

    it('Items が未定義なら空配列を返し、例外はそのまま伝播する', async () => {
      send.mockResolvedValueOnce({});
      expect(await scanAllItems(docClient, { TableName: 't' })).toEqual([]);

      const error = new Error('失敗');
      send.mockRejectedValueOnce(error);
      await expect(scanAllItems(docClient, { TableName: 't' })).rejects.toBe(error);
    });
  });

  describe.each([
    ['queryPage', queryPage, QueryCommand],
    ['scanPage', scanPage, ScanCommand],
  ] as const)('%s', (_name, fn, CommandClass) => {
    const input = { TableName: 't' };

    it('対応するコマンドで Limit を付けて送り、cursor が無ければ ExclusiveStartKey キーを含めない', async () => {
      send.mockResolvedValueOnce({ Items: [item(1)] });

      await fn(docClient, input, { limit: 30 });

      const sent = send.mock.calls[0][0];
      expect(sent).toBeInstanceOf(CommandClass);
      expect(sent.input).toStrictEqual({ TableName: 't', Limit: 30 });
      expect('ExclusiveStartKey' in sent.input).toBe(false);
    });

    it('呼び出し側の input を書き換えない', async () => {
      send.mockResolvedValueOnce({ Items: [] });
      const original = { TableName: 't' };

      await fn(docClient, original, { limit: 10, cursor: encodeCursor({ PK: 'a', SK: 'b' }) });

      expect(original).toStrictEqual({ TableName: 't' });
    });

    it('cursor を decode して ExclusiveStartKey に入れる', async () => {
      const key = { PK: 'P#1', SK: 'S#1' };
      send.mockResolvedValueOnce({ Items: [] });

      await fn(docClient, input, { limit: 10, cursor: encodeCursor(key) });

      expect(send.mock.calls[0][0].input.ExclusiveStartKey).toEqual(key);
    });

    it('不正な cursor は先頭から取得する', async () => {
      send.mockResolvedValueOnce({ Items: [] });

      await fn(docClient, input, { limit: 10, cursor: '%%%不正%%%' });

      expect('ExclusiveStartKey' in send.mock.calls[0][0].input).toBe(false);
    });

    it('LastEvaluatedKey があれば nextCursor に encode し、decode すると元のキーに戻る', async () => {
      const key = { PK: 'P#9', SK: 'S#9' };
      send.mockResolvedValueOnce({ Items: [item(1)], LastEvaluatedKey: key });

      const result = await fn(docClient, input, { limit: 1 });

      expect(result.nextCursor).toBeDefined();
      expect(decodeCursor(result.nextCursor)).toEqual(key);
    });

    it('LastEvaluatedKey が無ければ nextCursor は undefined', async () => {
      send.mockResolvedValueOnce({ Items: [item(1)] });

      const result = await fn(docClient, input, { limit: 10 });

      expect(result.nextCursor).toBeUndefined();
    });

    it('Items が無い応答は空配列で返す', async () => {
      send.mockResolvedValueOnce({});

      const result = await fn(docClient, input, { limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('count は応答の Count ではなく返した items の件数になる', async () => {
      send.mockResolvedValueOnce({ Items: [item(1), item(2)], Count: 99 });

      const result = await fn(docClient, input, { limit: 10 });

      expect(result.items).toEqual([item(1), item(2)]);
      expect(result.count).toBe(2);
    });

    it('send の例外を同一インスタンスのまま伝播する', async () => {
      const error = new Error('失敗');
      send.mockRejectedValueOnce(error);

      await expect(fn(docClient, input, { limit: 10 })).rejects.toBe(error);
    });
  });
});
