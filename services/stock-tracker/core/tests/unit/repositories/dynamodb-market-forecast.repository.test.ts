/**
 * Stock Tracker Core - DynamoDB MarketForecast Repository Unit Tests
 *
 * DynamoDBMarketForecastRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (条件式・エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱い、条件付きの Outcome 追記、市場の期間 Query だけを検証する。
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityNotFoundError,
  InvalidEntityDataError,
  RepositoryError,
} from '@nagiyu/aws';
import { DynamoDBMarketForecastRepository } from '../../../src/repositories/dynamodb-market-forecast.repository.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import type { CreateMarketForecastInput } from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

const NOW = 1_700_100_000_000;
const CREATED_AT = 1_700_000_000_000;

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'MARKETFORECAST#US',
    SK: 'DATE#2026-02-27',
    Type: 'MarketForecast',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: {},
    Probabilities: {},
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBMarketForecastRepository', () => {
  let repository: DynamoDBMarketForecastRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  const createInput: CreateMarketForecastInput = {
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'market-range-avg': 0.1 },
    probabilities: {},
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
  };

  beforeEach(() => {
    // UpdatedAt は EntityStore と appendOutcome が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBMarketForecastRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('createIfAbsent', () => {
    it('未作成なら保存形式の Item を書き込み、created:true で返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.createIfAbsent(createInput);

      expect(result.created).toBe(true);
      expect(result.item).toMatchObject({ ...createInput, createdAt: NOW, updatedAt: NOW });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
      expect(command.input.Item).not.toHaveProperty('Outcome');
    });

    it('既に存在する場合は書き込まず、既存のアイテムを created:false で返す', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: buildItem() });

      const result = await repository.createIfAbsent(createInput);

      expect(result.created).toBe(false);
      expect(result.item.market).toBe('US');
      expect(result.item.createdAt).toBe(CREATED_AT);
      expect(mockDocClient.send.mock.calls[1][0]).toBeInstanceOf(GetCommand);
    });

    it('作成が衝突したのに既存が見つからないときは RepositoryError 派生の DatabaseError をスローする', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: undefined });

      const promise = repository.createIfAbsent(createInput);

      await expect(promise).rejects.toThrow(DatabaseError);
      await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    });

    it('その他のデータベースエラーは DatabaseError のままスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.createIfAbsent(createInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('appendOutcome', () => {
    const KEY = { market: 'US', date: '2026-02-27' } as const;
    const outcome: MarketOutcome = {
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextRange: 0.09,
      rangeRatio: 1.05,
      hit: { MKT: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('Outcome が未設定のアイテムにだけ書く条件付き UpdateItem で追記する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem({
          Outcome: { nextDate: '2026-02-28', hit: { MKT: true }, evaluatedAt: NOW },
          UpdatedAt: NOW,
        }),
      });

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(true);
      expect(result.item.outcome?.hit.MKT).toBe(true);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Key: { PK: 'MARKETFORECAST#US', SK: 'DATE#2026-02-27' },
        ConditionExpression: 'attribute_exists(#pk) AND attribute_not_exists(#outcome)',
        ReturnValues: 'ALL_NEW',
      });
      expect(command.input.ExpressionAttributeNames).toMatchObject({
        '#pk': 'PK',
        '#outcome': 'Outcome',
      });
    });

    it('Mapper で変換した Outcome（識別子を除いた形）と UpdatedAt だけを SET する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem() });

      await repository.appendOutcome(KEY, outcome);

      const { set, remove } = parseUpdateExpression(
        (mockDocClient.send.mock.calls[0][0] as UpdateCommand).input
      );
      expect(set).toEqual({
        Outcome: {
          nextDate: '2026-02-28',
          nextRange: 0.09,
          rangeRatio: 1.05,
          hit: { MKT: true },
          evaluatedAt: 1_700_100_000_000,
        },
        UpdatedAt: NOW,
      });
      expect(remove).toEqual([]);
    });

    it('既に Outcome がある場合は書き込まず updated:false で既存のアイテムを返す', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckFailed()).mockResolvedValueOnce({
        Item: buildItem({
          Outcome: { nextDate: '2026-02-28', hit: { MKT: false }, evaluatedAt: 1_699_000_000_000 },
        }),
      });

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(false);
      expect(result.item.outcome?.hit.MKT).toBe(false);
      expect(mockDocClient.send.mock.calls[1][0]).toBeInstanceOf(GetCommand);
    });

    it('対象 MarketForecast が存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: undefined });

      await expect(
        repository.appendOutcome({ market: 'JP', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('追記後のアイテムが返らないときは DatabaseError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await expect(repository.appendOutcome(KEY, outcome)).rejects.toThrow(DatabaseError);
    });

    it('追記後のアイテムが読めないときは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem({ AxisValues: 'broken' }) });

      await expect(repository.appendOutcome(KEY, outcome)).rejects.toThrow(InvalidEntityDataError);
    });

    it('その他のデータベースエラーは DatabaseError に変換される', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.appendOutcome(KEY, outcome)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByMarketAndDate', () => {
    it('市場と日付から組み立てたキーで取得し、Entity として返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem() });

      const result = await repository.getByMarketAndDate('US', '2026-02-27');

      expect(result).toMatchObject({ market: 'US', date: '2026-02-27', createdAt: CREATED_AT });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'MARKETFORECAST#US', SK: 'DATE#2026-02-27' });
    });
  });

  describe('getSamplesByDateRange', () => {
    const item = buildItem({ AxisValues: { 'market-range-avg': 0.1 } });

    it('from・to 両方指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });

      const result = await repository.getSamplesByDateRange('US', '2026-02-01', '2026-02-27');

      expect(result).toEqual([
        { market: 'US', date: '2026-02-27', axisValues: { 'market-range-avg': 0.1 } },
      ]);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': 'MARKETFORECAST#US',
          ':from': 'DATE#2026-02-01',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('from のみ指定時は以上条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });

      await repository.getSamplesByDateRange('US', '2026-02-01');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#pk = :pk AND #sk >= :from',
        ExpressionAttributeValues: { ':pk': 'MARKETFORECAST#US', ':from': 'DATE#2026-02-01' },
      });
    });

    it('to のみ指定時は以下条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });

      await repository.getSamplesByDateRange('US', undefined, '2026-02-27');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#pk = :pk AND #sk <= :to',
        ExpressionAttributeValues: { ':pk': 'MARKETFORECAST#US', ':to': 'DATE#2026-02-27#~' },
      });
    });

    it('両方省略時は市場の全件を Query し、使わない SK の名前を渡さない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });

      await repository.getSamplesByDateRange('US');

      const { input } = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(input.KeyConditionExpression).toBe('#pk = :pk');
      expect(input.ExpressionAttributeNames).not.toHaveProperty('#sk');
    });

    it('複数ページを LastEvaluatedKey で連結する', async () => {
      const lastKey = { PK: 'MARKETFORECAST#US', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [item], LastEvaluatedKey: lastKey })
        .mockResolvedValueOnce({
          Items: [buildItem({ Date: '2026-02-28', SK: 'DATE#2026-02-28' })],
        });

      const result = await repository.getSamplesByDateRange('US');

      expect(result.map((s) => s.date)).toEqual(['2026-02-27', '2026-02-28']);
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getSamplesByDateRange('US')).rejects.toThrow(DatabaseError);
    });
  });
});
