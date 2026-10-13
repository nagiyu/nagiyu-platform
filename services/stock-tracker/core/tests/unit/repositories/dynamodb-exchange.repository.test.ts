/**
 * Stock Tracker Core - DynamoDB Exchange Repository Unit Tests
 *
 * DynamoDBExchangeRepositoryのユニットテスト
 */

import { DynamoDBExchangeRepository } from '../../../src/repositories/dynamodb-exchange.repository.js';
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
import type { CreateExchangeInput } from '../../../src/entities/exchange.entity.js';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: `EXCHANGE#${id}`,
    SK: 'METADATA',
    Type: 'Exchange',
    GSI3PK: 'EXCHANGES',
    GSI3SK: `EXCHANGE#${id}`,
    ExchangeID: id,
    Name: id,
    Key: id,
    Timezone: 'America/New_York',
    Start: '09:30',
    End: '16:00',
    PriceSource: 'tradingview',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBExchangeRepository', () => {
  let repository: DynamoDBExchangeRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);

    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBExchangeRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const input: CreateExchangeInput = {
      exchangeId: 'NASDAQ',
      name: 'NASDAQ',
      key: 'NASDAQ',
      timezone: 'America/New_York',
      start: '09:30',
      end: '16:00',
      priceSource: 'finnhub',
    };

    it('新しい取引所を保存形式の Item として書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject({ ...input, createdAt: NOW, updatedAt: NOW });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          GSI3PK: 'EXCHANGES',
          GSI3SK: 'EXCHANGE#NASDAQ',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          PriceSource: 'finnhub',
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
    });
  });

  describe('getById', () => {
    it('存在する取引所を Entity として取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: buildItem('NASDAQ', { Name: 'NASDAQ Stock Market', Market: 'US' }),
      });

      const result = await repository.getById('NASDAQ');

      expect(result).toEqual({
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NASDAQ',
        timezone: 'America/New_York',
        start: '09:30',
        end: '16:00',
        priceSource: 'tradingview',
        market: 'US',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' });
    });
  });

  describe('getAll', () => {
    it('Type フィルタ付き Scan で全ての取引所を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NASDAQ'), buildItem('NYSE')],
        Count: 2,
      });

      const result = await repository.getAll();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as ScanCommand;
      expect(command).toBeInstanceOf(ScanCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: { '#type': 'Type' },
        ExpressionAttributeValues: { ':type': 'Exchange' },
      });
    });

    it('GSIキー付きとキー無しが混在しても全件を返す', async () => {
      const withoutKey = (id: string) => {
        const item = buildItem(id);
        delete item.GSI3PK;
        delete item.GSI3SK;
        return item;
      };
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('AMEX'), withoutKey('NYSE'), withoutKey('TSE')],
      });

      const result = await repository.getAll();

      expect(result.map((e) => e.exchangeId)).toEqual(['AMEX', 'NYSE', 'TSE']);
    });

    it('LastEvaluatedKey を辿って全取引所を取得できる', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NASDAQ')],
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('NYSE')] });

      const result = await repository.getAll();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAllIndexed', () => {
    it('ExchangeTickerIndex の Query で取引所を取得する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NASDAQ'), buildItem('NYSE')],
        Count: 2,
      });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchanges',
        ExpressionAttributeNames: { '#gsi3pk': 'GSI3PK' },
        ExpressionAttributeValues: { ':exchanges': 'EXCHANGES' },
      });
    });

    it('Query が 0 件の場合は Scan にフォールバックして取引所を返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [], Count: 0 })
        .mockResolvedValueOnce({ Items: [buildItem('NASDAQ')] });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
      const scan = mockDocClient.send.mock.calls[1][0];
      expect(scan).toBeInstanceOf(ScanCommand);
      expect((scan as ScanCommand).input.ExpressionAttributeValues).toEqual({
        ':type': 'Exchange',
      });
    });

    it('Scan フォールバックでも LastEvaluatedKey を辿って全件取得する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({
          Items: [buildItem('NASDAQ')],
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('NYSE')] });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);
    });

    it('Query・Scan とも該当する取引所がない場合は空配列を返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [], Count: 0 })
        .mockResolvedValueOnce({ Count: 0 });

      expect(await repository.getAllIndexed()).toEqual([]);
    });

    it('Query の LastEvaluatedKey を辿って全取引所を取得できる', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NASDAQ')],
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('NYSE')] });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.exchangeId)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getAllIndexed()).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    function getUpdateCommand(): UpdateCommand {
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      return command;
    }

    it('取引所を更新し、更新後の Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('NASDAQ', { Name: 'NASDAQ (Updated)', UpdatedAt: NOW }),
      });

      const result = await repository.update('NASDAQ', { name: 'NASDAQ (Updated)' });

      expect(result.name).toBe('NASDAQ (Updated)');
      expect(result.updatedAt).toBe(NOW);
      const command = getUpdateCommand();
      expect(command.input.Key).toEqual({ PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' });
      expect(parseUpdateExpression(command.input).set).toMatchObject({
        Name: 'NASDAQ (Updated)',
        UpdatedAt: NOW,
      });
    });

    it('更新のたびに、引数の exchangeId から作った GSI3 キーを SET する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('NASDAQ') });

      await repository.update('NASDAQ', { name: 'NASDAQ (Updated)' });

      const { set } = parseUpdateExpression(getUpdateCommand().input);
      expect(set).toMatchObject({ GSI3PK: 'EXCHANGES', GSI3SK: 'EXCHANGE#NASDAQ' });
      // exchangeId は変更不可の項目なので、patch には混ぜない
      expect(set).not.toHaveProperty('ExchangeID');
    });

    it('変更が空でも、UpdatedAt と GSI3 キーだけを更新する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('NASDAQ') });

      await repository.update('NASDAQ', {});

      const parsed = parseUpdateExpression(getUpdateCommand().input);
      expect(Object.keys(parsed.set).sort()).toEqual(['GSI3PK', 'GSI3SK', 'UpdatedAt']);
      expect(parsed.remove).toEqual([]);
    });

    it('market を null で更新すると REMOVE 句が発行される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('NASDAQ') });

      const result = await repository.update('NASDAQ', { market: null });

      expect(result.market).toBeUndefined();
      const parsed = parseUpdateExpression(getUpdateCommand().input);
      expect(parsed.remove).toEqual(['Market']);
      expect(parsed.set).not.toHaveProperty('Market');
    });
  });

  describe('delete', () => {
    it('取引所IDから組み立てたキーで削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('NASDAQ');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' });
    });
  });
});
