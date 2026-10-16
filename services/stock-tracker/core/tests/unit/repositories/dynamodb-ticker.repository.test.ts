/**
 * Stock Tracker Core - DynamoDB Ticker Repository Unit Tests
 *
 * DynamoDBTickerRepositoryのユニットテスト
 */

import { DynamoDBTickerRepository } from '../../../src/repositories/dynamodb-ticker.repository.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import { DatabaseError } from '@nagiyu/aws';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateTickerInput } from '../../../src/entities/ticker.entity.js';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(tickerId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: `TICKER#${tickerId}`,
    SK: 'METADATA',
    Type: 'Ticker',
    GSI3PK: 'NASDAQ',
    GSI3SK: `TICKER#${tickerId}`,
    TickerID: tickerId,
    Symbol: tickerId.split(':')[1] ?? tickerId,
    Name: `${tickerId} Inc.`,
    ExchangeID: 'NASDAQ',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBTickerRepository', () => {
  let repository: DynamoDBTickerRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);

    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBTickerRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const input: CreateTickerInput = {
      tickerId: 'NSDQ:AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchangeId: 'NASDAQ',
    };

    it('新しいティッカーを保存形式の Item として書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toEqual({ ...input, createdAt: NOW, updatedAt: NOW });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          GSI3PK: 'NASDAQ',
          GSI3SK: 'TICKER#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
    });
  });

  describe('getById', () => {
    it('存在するティッカーを Entity として取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: buildItem('NSDQ:AAPL', { Name: 'Apple Inc.' }),
      });

      const result = await repository.getById('NSDQ:AAPL');

      expect(result).toEqual({
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' });
    });
  });

  describe('getByExchange', () => {
    it('ExchangeTickerIndex の Query で取引所ごとのティッカー一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL'), buildItem('NSDQ:NVDA')],
        Count: 2,
      });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((ticker) => ticker.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:NVDA']);
      expect(result.every((ticker) => ticker.exchangeId === 'NASDAQ')).toBe(true);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchangeId',
        ExpressionAttributeNames: { '#gsi3pk': 'GSI3PK' },
        ExpressionAttributeValues: { ':exchangeId': 'NASDAQ' },
      });
    });

    it('該当するティッカーがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      expect(await repository.getByExchange('UNKNOWN')).toEqual([]);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByExchange('NASDAQ')).rejects.toThrow(DatabaseError);
    });

    it('LastEvaluatedKey が返る限り Query をループし、複数ページの全件を集約する', async () => {
      // 3ページに分けて返す（1ページ目・2ページ目はLastEvaluatedKeyあり、3ページ目でループ終了）
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAA'), buildItem('NSDQ:BBB')],
          Count: 2,
          LastEvaluatedKey: { PK: 'TICKER#NSDQ:BBB', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:CCC')],
          Count: 1,
          LastEvaluatedKey: { PK: 'TICKER#NSDQ:CCC', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:DDD')],
          Count: 1,
        });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((item) => item.tickerId)).toEqual([
        'NSDQ:AAA',
        'NSDQ:BBB',
        'NSDQ:CCC',
        'NSDQ:DDD',
      ]);
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);

      // 2回目・3回目のQueryにはExclusiveStartKeyとして前ページのLastEvaluatedKeyが渡される
      const secondCall = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      const thirdCall = mockDocClient.send.mock.calls[2][0] as QueryCommand;
      expect(secondCall.input.ExclusiveStartKey).toEqual({
        PK: 'TICKER#NSDQ:BBB',
        SK: 'METADATA',
      });
      expect(thirdCall.input.ExclusiveStartKey).toEqual({
        PK: 'TICKER#NSDQ:CCC',
        SK: 'METADATA',
      });

      // Limitは指定しない（DynamoDBの1MBページ単位でよい契約のため）
      const firstCall = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(firstCall.input.Limit).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('Type フィルタ付き Scan で全てのティッカーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL')],
        Count: 1,
      });

      const result = await repository.getAll();

      expect(result.items.map((ticker) => ticker.tickerId)).toEqual(['NSDQ:AAPL']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as ScanCommand;
      expect(command).toBeInstanceOf(ScanCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: { '#type': 'Type' },
        ExpressionAttributeValues: { ':type': 'Ticker' },
      });
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });

    it('options 未指定時は LastEvaluatedKey がなくなるまで全ページを取得する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL')],
          Count: 1,
          LastEvaluatedKey: { PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({
          Items: [buildItem('NYSE:IBM', { ExchangeID: 'NYSE' })],
          Count: 1,
        });

      const result = await repository.getAll();

      expect(result.items).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.nextCursor).toBeUndefined();
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      const firstScanCommand = mockDocClient.send.mock.calls[0][0] as ScanCommand;
      const secondScanCommand = mockDocClient.send.mock.calls[1][0] as ScanCommand;
      expect(firstScanCommand.input.Limit).toBeUndefined();
      expect(secondScanCommand.input.ExclusiveStartKey).toEqual({
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
      });
    });

    it('options 指定時はページネーション結果を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL')],
        Count: 1,
        LastEvaluatedKey: { PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' },
      });

      const result = await repository.getAll({ limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.nextCursor).toBeDefined();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const scanCommand = mockDocClient.send.mock.calls[0][0] as ScanCommand;
      expect(scanCommand.input.Limit).toBe(1);
    });

    it('前ページの nextCursor を指定すると、続きから Scan する', async () => {
      const lastEvaluatedKey = { PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL')],
          Count: 1,
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:NVDA')], Count: 1 });

      const first = await repository.getAll({ limit: 1 });
      const second = await repository.getAll({ limit: 1, cursor: first.nextCursor });

      expect(second.items.map((ticker) => ticker.tickerId)).toEqual(['NSDQ:NVDA']);
      expect(second.nextCursor).toBeUndefined();
      const secondScan = mockDocClient.send.mock.calls[1][0] as ScanCommand;
      expect(secondScan.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });
  });

  describe('update', () => {
    function getUpdateCommand(): UpdateCommand {
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      return command;
    }

    it('ティッカーを更新し、更新後の Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('NSDQ:AAPL', { Name: 'Apple Inc. (Updated)', UpdatedAt: NOW }),
      });

      const result = await repository.update('NSDQ:AAPL', { name: 'Apple Inc. (Updated)' });

      expect(result.name).toBe('Apple Inc. (Updated)');
      expect(result.updatedAt).toBe(NOW);
      const command = getUpdateCommand();
      expect(command.input.Key).toEqual({ PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' });
      expect(parseUpdateExpression(command.input).set).toEqual({
        Name: 'Apple Inc. (Updated)',
        UpdatedAt: NOW,
      });
    });
  });

  describe('delete', () => {
    it('ティッカーIDから組み立てたキーで削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'TICKER#NSDQ:AAPL', SK: 'METADATA' });
    });
  });
});
