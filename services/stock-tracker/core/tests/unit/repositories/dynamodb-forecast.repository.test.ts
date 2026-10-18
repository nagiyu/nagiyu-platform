/**
 * Stock Tracker Core - DynamoDB Forecast Repository Unit Tests
 *
 * DynamoDBForecastRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (条件式・エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱い、条件付きの Outcome 追記、GSI4 の Query と射影だけを検証する。
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
import { DynamoDBForecastRepository } from '../../../src/repositories/dynamodb-forecast.repository.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import type { CreateForecastInput } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

const NOW = 1_700_100_000_000;
const CREATED_AT = 1_700_000_000_000;

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'FORECAST#NSDQ:AAPL',
    SK: 'DATE#2026-02-27',
    Type: 'Forecast',
    GSI4PK: 'FORECAST#NASDAQ',
    GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: {},
    Normal: {},
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

describe('DynamoDBForecastRepository', () => {
  let repository: DynamoDBForecastRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  const createInput: CreateForecastInput = {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'buy-count-ge2': true },
    normal: { range: 0.03 },
    probabilities: {},
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
  };

  beforeEach(() => {
    // UpdatedAt は EntityStore と appendOutcome が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBForecastRepository(mockDocClient, TABLE_NAME);
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
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          GSI4PK: 'FORECAST#NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
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
      expect(result.item.tickerId).toBe('NSDQ:AAPL');
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
    const KEY = { tickerId: 'NSDQ:AAPL', date: '2026-02-27' };
    const outcome: TickerOutcome = {
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextReturn: 0.01,
      excessReturn: 0.005,
      nextRange: 0.02,
      rangeRatio: 1.1,
      hit: { DIR: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('Outcome が未設定のアイテムにだけ書く条件付き UpdateItem で追記する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem({
          Outcome: { nextDate: '2026-02-28', hit: { DIR: true }, evaluatedAt: NOW },
          UpdatedAt: NOW,
        }),
      });

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(true);
      expect(result.item.outcome?.hit.DIR).toBe(true);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Key: { PK: 'FORECAST#NSDQ:AAPL', SK: 'DATE#2026-02-27' },
        ConditionExpression: 'attribute_exists(#pk) AND attribute_not_exists(#outcome)',
        ReturnValues: 'ALL_NEW',
      });
      expect(command.input.ExpressionAttributeNames).toMatchObject({
        '#pk': 'PK',
        '#outcome': 'Outcome',
      });
    });

    it('Mapper で変換した Outcome（識別子を除いた形）と UpdatedAt を SET する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem() });

      await repository.appendOutcome(KEY, outcome);

      const { set, remove } = parseUpdateExpression(
        (mockDocClient.send.mock.calls[0][0] as UpdateCommand).input
      );
      expect(set).toMatchObject({
        Outcome: {
          nextDate: '2026-02-28',
          nextReturn: 0.01,
          excessReturn: 0.005,
          nextRange: 0.02,
          rangeRatio: 1.1,
          hit: { DIR: true },
          evaluatedAt: 1_700_100_000_000,
        },
        UpdatedAt: NOW,
      });
      expect(set.Outcome).not.toHaveProperty('tickerId');
      // GSI4SK はキーから付け直す値で、Outcome の追記では変わらない
      expect(Object.keys(set).sort()).toEqual(['GSI4SK', 'Outcome', 'UpdatedAt']);
      expect(set.GSI4SK).toBe('DATE#2026-02-27#NSDQ:AAPL');
      expect(remove).toEqual([]);
    });

    it('予測部分の属性は書き換えない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem() });

      await repository.appendOutcome(KEY, outcome);

      const { set } = parseUpdateExpression(
        (mockDocClient.send.mock.calls[0][0] as UpdateCommand).input
      );
      for (const name of [
        'TickerID',
        'ExchangeID',
        'Market',
        'Date',
        'AxisValues',
        'Normal',
        'Probabilities',
        'ModelVersion',
        'Source',
        'CreatedAt',
      ]) {
        expect(set).not.toHaveProperty(name);
      }
    });

    it('既に Outcome がある場合は書き込まず updated:false で既存のアイテムを返す', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckFailed()).mockResolvedValueOnce({
        Item: buildItem({
          Outcome: { nextDate: '2026-02-28', hit: { DIR: false }, evaluatedAt: 1_699_000_000_000 },
        }),
      });

      const result = await repository.appendOutcome(KEY, outcome);

      expect(result.updated).toBe(false);
      expect(result.item.outcome?.hit.DIR).toBe(false);
      expect(mockDocClient.send.mock.calls[1][0]).toBeInstanceOf(GetCommand);
    });

    it('対象 Forecast が存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: undefined });

      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, outcome)
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

  describe('getByTickerAndDate', () => {
    it('ティッカーIDと日付から組み立てたキーで取得し、Entity として返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem() });

      const result = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');

      expect(result).toMatchObject({ tickerId: 'NSDQ:AAPL', market: 'US', createdAt: CREATED_AT });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'FORECAST#NSDQ:AAPL', SK: 'DATE#2026-02-27' });
    });
  });

  describe('getByExchangeAndDate', () => {
    it('GSI4 Query（FORECAST# 接頭辞つき）を使う', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildItem()] });

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((i) => i.tickerId)).toEqual(['NSDQ:AAPL']);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
        ExpressionAttributeNames: { '#gsi4pk': 'GSI4PK', '#gsi4sk': 'GSI4SK' },
        ExpressionAttributeValues: {
          ':exchangeId': 'FORECAST#NASDAQ',
          ':datePrefix': 'DATE#2026-02-27',
        },
      });
    });

    it('複数ページを LastEvaluatedKey で連結して取得する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem({ PK: 'FORECAST#T1', TickerID: 'T1' })],
          LastEvaluatedKey: { PK: 'FORECAST#T1', SK: 'DATE#2026-02-27' },
        })
        .mockResolvedValueOnce({ Items: [buildItem({ PK: 'FORECAST#T2', TickerID: 'T2' })] });

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((i) => i.tickerId)).toEqual(['T1', 'T2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('読めないアイテムを含むと InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildItem({ Source: 'UNKNOWN' })] });

      await expect(repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getSamplesByExchangesAndDateRange', () => {
    const sampleItem = {
      PK: 'FORECAST#NSDQ:AAPL',
      SK: 'DATE#2026-02-27',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Market: 'US',
      Date: '2026-02-27',
      AxisValues: { 'buy-count-ge2': true },
    };

    /** ProjectionExpression のプレースホルダを属性名に解決する */
    function resolveProjection(command: QueryCommand): string[] {
      const names = command.input.ExpressionAttributeNames ?? {};
      return (command.input.ProjectionExpression ?? '').split(', ').map((path) =>
        path
          .split('.')
          .map((placeholder) => names[placeholder])
          .join('.')
      );
    }

    it('from・to 両方指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        '2026-02-01',
        '2026-02-27'
      );

      expect(result).toEqual([
        {
          tickerId: 'NSDQ:AAPL',
          exchangeId: 'NASDAQ',
          market: 'US',
          date: '2026-02-27',
          axisValues: { 'buy-count-ge2': true },
        },
      ]);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':exchangeId': 'FORECAST#NASDAQ',
          ':from': 'DATE#2026-02-01',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('from のみ指定時は以上条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], '2026-02-01');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk >= :from',
        ExpressionAttributeValues: { ':exchangeId': 'FORECAST#NASDAQ', ':from': 'DATE#2026-02-01' },
      });
    });

    it('to のみ指定時は以下条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], undefined, '2026-02-27');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk <= :to',
        ExpressionAttributeValues: {
          ':exchangeId': 'FORECAST#NASDAQ',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('両方省略時はパーティション全件を Query し、使わない GSI4SK の名前を渡さない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);

      const { input } = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(input.KeyConditionExpression).toBe('#gsi4pk = :exchangeId');
      expect(input.ExpressionAttributeNames).not.toHaveProperty('#gsi4sk');
    });

    it('射影するのは学習に使う保存属性だけで、確率はネストした値だけを読む', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);

      const projected = resolveProjection(mockDocClient.send.mock.calls[0][0] as QueryCommand);
      expect(projected).toEqual([
        'TickerID',
        'ExchangeID',
        'Market',
        'Date',
        'AxisValues',
        'Normal',
        'Outcome',
        'Probabilities.DIR.probability',
        'Probabilities.DIR.baseline',
        'Probabilities.VOL.probability',
        'Probabilities.VOL.baseline',
      ]);
    });

    it('式で使わないプレースホルダを ExpressionAttributeNames に含めない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], '2026-02-01', '2026-02-27');

      const { input } = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      const expressions = `${input.KeyConditionExpression} ${input.ProjectionExpression}`;
      for (const placeholder of Object.keys(input.ExpressionAttributeNames ?? {})) {
        expect(expressions).toContain(placeholder);
      }
    });

    it('複数の取引所をまとめて読み出す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] }).mockResolvedValueOnce({
        Items: [{ ...sampleItem, ExchangeID: 'NYSE', TickerID: 'NYSE:GE' }],
      });

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ', 'NYSE']);

      expect(result).toHaveLength(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExpressionAttributeValues).toMatchObject({
        ':exchangeId': 'FORECAST#NYSE',
      });
    });

    it('LastEvaluatedKey がある間は全ページを読み出す', async () => {
      const lastKey = { PK: 'FORECAST#NSDQ:AAPL', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [sampleItem], LastEvaluatedKey: lastKey })
        .mockResolvedValueOnce({ Items: [{ ...sampleItem, TickerID: 'NSDQ:MSFT' }] });

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);

      expect(result.map((sample) => sample.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      const first = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(first.input).not.toHaveProperty('ExclusiveStartKey');
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getSamplesByExchangesAndDateRange(['NASDAQ'])).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
