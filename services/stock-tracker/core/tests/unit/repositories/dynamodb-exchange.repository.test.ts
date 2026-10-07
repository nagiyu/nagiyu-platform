/**
 * Stock Tracker Core - DynamoDB Exchange Repository Unit Tests
 *
 * DynamoDBExchangeRepositoryのユニットテスト
 */

import { DynamoDBExchangeRepository } from '../../../src/repositories/dynamodb-exchange.repository.js';
import {
  parseUpdateExpression,
  type UpdateExpressionInput,
} from '../../helpers/update-expression.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import { QueryCommand, ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateExchangeInput } from '../../../src/entities/exchange.entity.js';

describe('DynamoDBExchangeRepository', () => {
  let repository: DynamoDBExchangeRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBExchangeRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('新しい取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じExchangeIDの取引所が既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在する取引所を取得できる', async () => {
      const mockItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await repository.getById('NASDAQ');

      expect(result).toMatchObject({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しない取引所の場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('NOTFOUND');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('NASDAQ')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAll', () => {
    it('全ての取引所を取得できる', async () => {
      const mockItems = [
        {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NASDAQ',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'EXCHANGE#NYSE',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NYSE',
          Name: 'New York Stock Exchange',
          Key: 'NYSE',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].ExchangeID).toBe('NASDAQ');
      expect(result[1].ExchangeID).toBe('NYSE');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('GSIキー付きとキー無しが混在しても全件を返す', async () => {
      const buildItem = (id: string, withKey: boolean) => ({
        PK: `EXCHANGE#${id}`,
        SK: 'METADATA',
        Type: 'Exchange',
        ...(withKey ? { GSI3PK: 'EXCHANGES', GSI3SK: `EXCHANGE#${id}` } : {}),
        ExchangeID: id,
        Name: id,
        Key: id,
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('AMEX', true), buildItem('NYSE', false), buildItem('TSE', false)],
      });

      const result = await repository.getAll();

      expect(result.map((e) => e.ExchangeID)).toEqual(['AMEX', 'NYSE', 'TSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(ScanCommand);
    });

    it('該当する取引所がない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(0);
    });

    it('Itemsが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Count: 0,
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(0);
    });

    it('DynamoDBのページネーション（LastEvaluatedKey）を処理して全取引所を取得できる', async () => {
      const mockItemsPage1 = [
        {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NASDAQ',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];
      const mockItemsPage2 = [
        {
          PK: 'EXCHANGE#NYSE',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NYSE',
          Name: 'New York Stock Exchange',
          Key: 'NYSE',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send
        .mockResolvedValueOnce({
          Items: mockItemsPage1,
          Count: 1,
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({
          Items: mockItemsPage2,
          Count: 1,
          LastEvaluatedKey: undefined,
        });

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].ExchangeID).toBe('NASDAQ');
      expect(result[1].ExchangeID).toBe('NYSE');
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAllIndexed', () => {
    it('全ての取引所を取得できる', async () => {
      const mockItems = [
        {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NASDAQ',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'EXCHANGE#NYSE',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NYSE',
          Name: 'New York Stock Exchange',
          Key: 'NYSE',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getAllIndexed();

      expect(result).toHaveLength(2);
      expect(result[0].ExchangeID).toBe('NASDAQ');
      expect(result[1].ExchangeID).toBe('NYSE');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);

      const command = mockDocClient.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(QueryCommand);
      expect((command as QueryCommand).input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchanges',
        ExpressionAttributeNames: { '#gsi3pk': 'GSI3PK' },
        ExpressionAttributeValues: { ':exchanges': 'EXCHANGES' },
      });
    });

    it('Queryが0件の場合はScanにフォールバックして取引所を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 }).mockResolvedValueOnce({
        Items: [
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'METADATA',
            Type: 'Exchange',
            ExchangeID: 'NASDAQ',
            Name: 'NASDAQ',
            Key: 'NASDAQ',
            Timezone: 'America/New_York',
            Start: '09:30',
            End: '16:00',
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
          },
        ],
      });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.ExchangeID)).toEqual(['NASDAQ']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
      const scan = mockDocClient.send.mock.calls[1][0];
      expect(scan).toBeInstanceOf(ScanCommand);
      expect((scan as ScanCommand).input.ExpressionAttributeValues).toEqual({
        ':type': 'Exchange',
      });
    });

    it('Scanフォールバックでも LastEvaluatedKey を辿って全件取得する', async () => {
      const buildItem = (id: string) => ({
        PK: `EXCHANGE#${id}`,
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: id,
        Name: id,
        Key: id,
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({
          Items: [buildItem('NASDAQ')],
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('NYSE')] });

      const result = await repository.getAllIndexed();

      expect(result.map((e) => e.ExchangeID)).toEqual(['NASDAQ', 'NYSE']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);
    });

    it('Query・Scanとも該当する取引所がない場合は空配列を返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [], Count: 0 })
        .mockResolvedValueOnce({ Count: 0 });

      const result = await repository.getAllIndexed();

      expect(result).toHaveLength(0);
    });

    it('DynamoDBのページネーション（LastEvaluatedKey）を処理して全取引所を取得できる', async () => {
      const mockItemsPage1 = [
        {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ',
          Key: 'NASDAQ',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];
      const mockItemsPage2 = [
        {
          PK: 'EXCHANGE#NYSE',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NYSE',
          Name: 'New York Stock Exchange',
          Key: 'NYSE',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send
        .mockResolvedValueOnce({
          Items: mockItemsPage1,
          Count: 1,
          LastEvaluatedKey: { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' },
        })
        .mockResolvedValueOnce({
          Items: mockItemsPage2,
          Count: 1,
          LastEvaluatedKey: undefined,
        });

      const result = await repository.getAllIndexed();

      expect(result).toHaveLength(2);
      expect(result[0].ExchangeID).toBe('NASDAQ');
      expect(result[1].ExchangeID).toBe('NYSE');
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getAllIndexed()).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('取引所を更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ (Updated)',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NASDAQ', {
        Name: 'NASDAQ (Updated)',
      });

      expect(result.Name).toBe('NASDAQ (Updated)');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('更新のたびにGSI3キーをSETする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ (Updated)',
          Key: 'NASDAQ',
          Timezone: 'America/New_York',
          Start: '09:30',
          End: '16:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067300000,
        },
      });

      await repository.update('NASDAQ', { Name: 'NASDAQ (Updated)' });

      const input = (mockDocClient.send.mock.calls[0][0] as { input: Record<string, unknown> })
        .input;
      expect(parseUpdateExpression(input).set).toMatchObject({
        GSI3PK: 'EXCHANGES',
        GSI3SK: 'EXCHANGE#NASDAQ',
      });
    });

    it('存在しない取引所を更新しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.update('NOTFOUND', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      await expect(repository.update('NASDAQ', {})).rejects.toThrow(DatabaseError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('NASDAQ', { Name: 'Updated' })).rejects.toThrow(DatabaseError);
    });

    it('複数のフィールドを同時に更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ (Updated)',
        Key: 'NASDAQ',
        Timezone: 'America/Chicago',
        Start: '08:30',
        End: '15:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067400000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NASDAQ', {
        Name: 'NASDAQ (Updated)',
        Timezone: 'America/Chicago',
        Start: '08:30',
        End: '15:00',
      });

      expect(result.Name).toBe('NASDAQ (Updated)');
      expect(result.Timezone).toBe('America/Chicago');
      expect(result.Start).toBe('08:30');
      expect(result.End).toBe('15:00');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('Attributesが存在しない場合はEntityNotFoundErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: undefined,
      });

      await expect(repository.update('NASDAQ', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('Market を指定して更新するとSET句に含まれる', async () => {
      const mockUpdatedItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        Market: 'US',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NASDAQ', { Market: 'US' });

      expect(result.Market).toBe('US');
      const sentCommand = mockDocClient.send.mock.calls[0]?.[0] as {
        input: {
          UpdateExpression: string;
          ExpressionAttributeNames: Record<string, string>;
          ExpressionAttributeValues: Record<string, unknown>;
        };
      };
      const parsed = parseUpdateExpression(sentCommand.input);
      expect(parsed.set).toMatchObject({ Market: 'US' });
      expect(parsed.remove).toEqual([]);
      expect(sentCommand.input.UpdateExpression).not.toContain('REMOVE');
    });

    it('Market を null で更新するとREMOVE句が発行される', async () => {
      const mockUpdatedItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
        // Market はREMOVEされたため存在しない
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NASDAQ', { Market: null });

      expect(result.Market).toBeUndefined();
      const sentCommand = mockDocClient.send.mock.calls[0]?.[0] as {
        input: {
          UpdateExpression: string;
          ExpressionAttributeNames: Record<string, string>;
          ExpressionAttributeValues: Record<string, unknown>;
        };
      };
      const parsed = parseUpdateExpression(sentCommand.input);
      expect(parsed.remove).toEqual(['Market']);
      expect(parsed.set).not.toHaveProperty('Market');
    });

    it('Market を指定しない更新ではSET句にもREMOVE句にも含まれない', async () => {
      const mockUpdatedItem = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ (Updated)',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      await repository.update('NASDAQ', { Name: 'NASDAQ (Updated)' });

      const sentCommand = mockDocClient.send.mock.calls[0]?.[0] as {
        input: UpdateExpressionInput;
      };
      const parsed = parseUpdateExpression(sentCommand.input);
      expect(parsed.remove).toEqual([]);
      expect(parsed.set).not.toHaveProperty('Market');
      expect(Object.values(sentCommand.input.ExpressionAttributeNames ?? {})).not.toContain(
        'Market'
      );
    });
  });

  describe('delete', () => {
    it('取引所を削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('NASDAQ');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しない取引所を削除しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('NOTFOUND')).rejects.toThrow(EntityNotFoundError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('NASDAQ')).rejects.toThrow(DatabaseError);
    });
  });
});
