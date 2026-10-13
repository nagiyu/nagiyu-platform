/**
 * Stock Tracker Core - DynamoDB Alert Repository Unit Tests
 *
 * DynamoDBAlertRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、GSI の Query や
 * 失効の書き込みといったリポジトリ独自の部分を検証する。
 */

import { DynamoDBAlertRepository } from '../../../src/repositories/dynamodb-alert.repository.js';
import { AlertMapper } from '../../../src/mappers/alert.mapper.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import { DatabaseError, EntityNotFoundError } from '@nagiyu/aws';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateAlertInput } from '../../../src/entities/alert.entity.js';
import { logger } from '@nagiyu/common';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const SUBSCRIPTION = {
  endpoint: 'https://example.com/push',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};

function buildItem(alertId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'USER#user-123',
    SK: `ALERT#${alertId}`,
    Type: 'Alert',
    GSI1PK: 'user-123',
    GSI1SK: `Alert#${alertId}`,
    GSI2PK: 'ALERT#MINUTE_LEVEL',
    GSI2SK: `user-123#${alertId}`,
    AlertID: alertId,
    UserID: 'user-123',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Buy',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
    Subscription: SUBSCRIPTION,
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBAlertRepository', () => {
  let repository: DynamoDBAlertRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);

    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBAlertRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const input: CreateAlertInput = {
      userId: 'user-123',
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      mode: 'Buy',
      frequency: 'MINUTE_LEVEL',
      enabled: true,
      conditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
      subscription: SUBSCRIPTION,
    };

    it('UUID のアラートIDを採番し、保存形式の Item として書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result.alertId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(result).toEqual({ ...input, alertId: result.alertId, createdAt: NOW, updatedAt: NOW });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'USER#user-123',
          SK: `ALERT#${result.alertId}`,
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: `Alert#${result.alertId}`,
          GSI2PK: 'ALERT#MINUTE_LEVEL',
          GSI2SK: `user-123#${result.alertId}`,
          AlertID: result.alertId,
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          Subscription: SUBSCRIPTION,
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
      expect(command.input.Item).not.toHaveProperty('subscription');
    });
  });

  describe('getById', () => {
    it('存在するアラートを Entity として取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('alert-1') });

      const result = await repository.getById('user-123', 'alert-1');

      expect(result).toEqual({
        alertId: 'alert-1',
        userId: 'user-123',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Buy',
        frequency: 'MINUTE_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: SUBSCRIPTION,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'ALERT#alert-1' });
    });

    it('旧属性名 subscription で保存されたアラートも取得できる', async () => {
      const item = buildItem('alert-1');
      const { Subscription, ...withoutNew } = item;
      mockDocClient.send.mockResolvedValueOnce({
        Item: { ...withoutNew, subscription: Subscription },
      });

      const result = await repository.getById('user-123', 'alert-1');

      expect(result?.subscription).toEqual(SUBSCRIPTION);
    });
  });

  describe('getByUserId', () => {
    it('UserIndex の Query でユーザーのアラート一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('alert-1'), buildItem('alert-2')],
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items.map((alert) => alert.alertId)).toEqual(['alert-1', 'alert-2']);
      expect(result.count).toBe(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'UserIndex',
        KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':userId': 'user-123', ':prefix': 'Alert#' },
      });
    });

    it('論理削除待ち (TTL 設定済み) のアラートを除外する FilterExpression が常に付与される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.FilterExpression).toBe('attribute_not_exists(#ttl)');
      expect(command.input.ExpressionAttributeNames).toMatchObject({
        '#gsi1pk': 'GSI1PK',
        '#gsi1sk': 'GSI1SK',
        '#ttl': 'TTL',
      });
    });

    it('limit 未指定時は既定の 50 件を Limit に指定する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(50);
    });

    it('limit を指定するとその値を Limit に指定する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123', { limit: 2 });

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(2);
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('LastEvaluatedKey を nextCursor として返し、次の呼び出しで ExclusiveStartKey に渡す', async () => {
      const lastEvaluatedKey = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
      };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('alert-1')],
          Count: 1,
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('alert-2')], Count: 1 });

      const first = await repository.getByUserId('user-123', { limit: 1 });
      const second = await repository.getByUserId('user-123', {
        limit: 1,
        cursor: first.nextCursor,
      });

      expect(first.nextCursor).toBe(
        Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
      );
      expect(second.items.map((alert) => alert.alertId)).toEqual(['alert-2']);
      expect(second.nextCursor).toBeUndefined();
      const secondQuery = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(secondQuery.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });

    it('無効なアラートデータをスキップし、有効なデータのみ返す', async () => {
      const invalidItem = buildItem('invalid-alert', { Subscription: undefined });
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('alert-1'), invalidItem],
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items.map((alert) => alert.alertId)).toEqual(['alert-1']);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({ pk: 'USER#user-123', sk: 'ALERT#invalid-alert' })
      );
    });
  });

  describe('getByFrequency', () => {
    it('AlertIndex の Query で頻度ごとのアラート一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('alert-1'), buildItem('alert-2')],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.map((alert) => alert.alertId)).toEqual(['alert-1', 'alert-2']);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'AlertIndex',
        KeyConditionExpression: '#gsi2pk = :pk',
        ExpressionAttributeNames: { '#gsi2pk': 'GSI2PK' },
        ExpressionAttributeValues: { ':pk': 'ALERT#MINUTE_LEVEL' },
      });
      // 全件を返す契約のため Limit は指定しない
      expect(command.input.Limit).toBeUndefined();
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      expect(await repository.getByFrequency('HOURLY_LEVEL')).toEqual([]);
    });

    it('LastEvaluatedKey が返る限り Query をループし、複数ページの全件を集約する', async () => {
      const lastEvaluatedKey = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-1',
      };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('alert-1')],
          Count: 1,
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('alert-2')], Count: 1 });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.map((alert) => alert.alertId)).toEqual(['alert-1', 'alert-2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const secondQuery = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(secondQuery.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByFrequency('MINUTE_LEVEL')).rejects.toThrow(DatabaseError);
    });

    it('2 ページ目の Query でデータベースエラーが発生した場合も DatabaseError をスローする', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('alert-1')],
          LastEvaluatedKey: { PK: 'USER#user-123', SK: 'ALERT#alert-1' },
        })
        .mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByFrequency('MINUTE_LEVEL')).rejects.toThrow(DatabaseError);
    });

    it('無効なアラートデータをスキップし、バッチ全体は壊さずに有効なデータのみ返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('invalid-alert', { Subscription: undefined }), buildItem('alert-1')],
        Count: 2,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.map((alert) => alert.alertId)).toEqual(['alert-1']);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効なアラートデータをスキップしました',
        expect.objectContaining({ sk: 'ALERT#invalid-alert' })
      );
    });

    it('mapper が InvalidEntityDataError 以外のエラーを投げても、バッチを壊さずにスキップする', async () => {
      const spy = jest.spyOn(AlertMapper.prototype, 'toEntity').mockImplementationOnce(() => {
        throw new TypeError('想定外のエラー');
      });
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildItem('alert-1')], Count: 1 });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('update', () => {
    it('アラートを更新し、更新後の Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', { Enabled: false, UpdatedAt: NOW }),
      });

      const result = await repository.update('user-123', 'alert-1', { enabled: false });

      expect(result.enabled).toBe(false);
      expect(result.updatedAt).toBe(NOW);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'ALERT#alert-1' });
      expect(parseUpdateExpression(command.input).set).toEqual({
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-1',
        GSI2SK: 'user-123#alert-1',
        Enabled: false,
        UpdatedAt: NOW,
      });
    });

    it('logicalOperator を保存する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', { LogicalOperator: 'OR' }),
      });

      await repository.update('user-123', 'alert-1', { logicalOperator: 'OR' });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).set).toMatchObject({ LogicalOperator: 'OR' });
    });

    it('frequency を更新すると GSI2PK も付け直す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', {
          Frequency: 'HOURLY_LEVEL',
          GSI2PK: 'ALERT#HOURLY_LEVEL',
        }),
      });

      await repository.update('user-123', 'alert-1', { frequency: 'HOURLY_LEVEL' });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).set).toMatchObject({
        Frequency: 'HOURLY_LEVEL',
        GSI2PK: 'ALERT#HOURLY_LEVEL',
      });
    });

    it('サブスクリプションを新属性名で書き、旧属性名を削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('alert-1') });

      await repository.update('user-123', 'alert-1', { subscription: SUBSCRIPTION });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toMatchObject({ Subscription: SUBSCRIPTION });
      expect(parsed.remove).toEqual(['subscription']);
    });

    it('null を渡した任意項目は属性を削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('alert-1') });

      await repository.update('user-123', 'alert-1', {
        customMessage: null,
        temporaryExpireDate: null,
        logicalOperator: null,
      });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).remove).toEqual([
        'TemporaryExpireDate',
        'LogicalOperator',
        'CustomMessage',
      ]);
    });

    it('変更が空でも更新日時だけを更新して成功する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', { UpdatedAt: NOW }),
      });

      const result = await repository.update('user-123', 'alert-1', {});

      expect(result.updatedAt).toBe(NOW);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).set).toMatchObject({ UpdatedAt: NOW });
    });
  });

  describe('delete', () => {
    it('ユーザーIDとアラートIDから組み立てたキーで削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'alert-1');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'ALERT#alert-1' });
    });
  });

  describe('getTemporaryCandidatesByFrequency', () => {
    const candidateItem = {
      PK: 'USER#user-1',
      SK: 'ALERT#alert-1',
      AlertID: 'alert-1',
      UserID: 'user-1',
      ExchangeID: 'NASDAQ',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
    };

    it('Temporary かつ Enabled な候補を軽量エンティティで返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [candidateItem], Count: 1 });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toEqual([
        {
          alertId: 'alert-1',
          userId: 'user-1',
          exchangeId: 'NASDAQ',
          frequency: 'MINUTE_LEVEL',
          enabled: true,
          temporary: true,
          temporaryExpireDate: '2026-03-04',
        },
      ]);
    });

    it('Query には Temporary=true AND TTL 未設定 の FilterExpression と ProjectionExpression が指定される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getTemporaryCandidatesByFrequency('HOURLY_LEVEL');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.FilterExpression).toBe(
        '#temporary = :true AND attribute_not_exists(#ttl)'
      );
      expect(command.input.ExpressionAttributeNames?.['#ttl']).toBe('TTL');
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'ALERT#HOURLY_LEVEL',
        ':true': true,
      });
      // 失効判定に不要なサブスクリプションは、新旧どちらの属性名も射影しない
      const projectedNames = Object.values(command.input.ExpressionAttributeNames ?? {}).map(
        (name) => name.toLowerCase()
      );
      expect(projectedNames).not.toContain('subscription');
      expect(command.input.ProjectionExpression).toContain('#alertId');
    });

    it('サブスクリプションが壊れていても、必要属性さえ揃っていれば返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [{ ...candidateItem, Subscription: 'broken' }],
        Count: 1,
      });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
    });

    it('必須属性が欠損したアイテムはスキップして警告ログを出す', async () => {
      const { AlertID: _alertId, ...broken } = candidateItem;
      void _alertId;
      mockDocClient.send.mockResolvedValueOnce({ Items: [broken], Count: 1 });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        '無効な一時アラート候補をスキップしました',
        expect.objectContaining({ pk: 'USER#user-1', sk: 'ALERT#alert-1' })
      );
    });

    it('limit と cursor を Query に渡し、LastEvaluatedKey を nextCursor として返す', async () => {
      const lastEvaluatedKey = { PK: 'USER#user-1', SK: 'ALERT#alert-1' };
      mockDocClient.send.mockResolvedValueOnce({
        Items: [candidateItem],
        Count: 1,
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL', {
        limit: 10,
      });

      expect(result.nextCursor).toBe(
        Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
      );
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(10);
    });

    it('limit 未指定時は既定の 50 件を Limit に指定する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(50);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DB down'));

      await expect(repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('markTemporaryAsExpired', () => {
    it('Enabled=false と TTL (エポック秒) を、サブスクリプションに触れずに SET する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', { Enabled: false, TTL: 1704067200 }),
      });

      await repository.markTemporaryAsExpired('user-123', 'alert-1', 1704067200999);

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'ALERT#alert-1' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toMatchObject({ Enabled: false, TTL: 1704067200, UpdatedAt: NOW });
      expect(Object.keys(parsed.set)).not.toContain('Subscription');
      expect(parsed.remove).toEqual([]);
    });

    it('対象アラートが存在しない場合は EntityNotFoundError', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckFailed());

      await expect(
        repository.markTemporaryAsExpired('user-123', 'alert-missing', 1)
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新後の Entity への変換がサブスクリプションの不正で失敗しても、例外にしない', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('alert-1', { Subscription: 'broken' }),
      });

      await expect(
        repository.markTemporaryAsExpired('user-123', 'alert-1', 1704067200999)
      ).resolves.toBeUndefined();
    });

    it('その他のエラーは DatabaseError にラップされる', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.markTemporaryAsExpired('user-123', 'alert-1', 1)).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
