/**
 * Unit tests for daily batch processing
 *
 * 全アラートの取得はリポジトリ経由で行うため、リポジトリは本物を使い、
 * DocumentClient の送信だけをモックして Query の内容とページ送りを検証する。
 */

import { handler } from '../../src/daily.js';
import type { ScheduledEvent } from '@nagiyu/aws';
import * as awsClients from '@nagiyu/aws';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AlertMapper } from '@nagiyu/stock-tracker-core';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';

// モックの設定
// createScheduledHandler の骨格は本物を使い、骨格内部のエラー報告も同じモックで観測できるよう
// 報告関数の実体モジュールを差し替える。
jest.mock('../../../../../libs/aws/src/error-events/report.js', () => ({
  ...jest.requireActual('../../../../../libs/aws/src/error-events/report.js'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));
jest.mock('@nagiyu/aws', () => {
  const actual = jest.requireActual('@nagiyu/aws');
  return {
    ...actual,
    getDynamoDBDocumentClient: jest.fn(),
    getTableName: jest.fn(),
  };
});

const mapper = new AlertMapper();

function buildAlert(alertId: string, overrides: Partial<AlertEntity> = {}): AlertEntity {
  return {
    alertId,
    userId: `user-${alertId}`,
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    mode: 'Sell',
    frequency: 'MINUTE_LEVEL',
    enabled: true,
    conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** 保存されている形の Item にする。リポジトリは Mapper を通して読む */
function toItem(alert: AlertEntity): Record<string, unknown> {
  return mapper.toItem(alert);
}

type Pages = Record<string, Array<Record<string, unknown>[]>>;

describe('daily batch handler', () => {
  let mockDocClient: {
    send: jest.Mock;
  };
  let mockEvent: ScheduledEvent;

  /**
   * AlertIndex の Query に、頻度ごとのページ列で応答する。
   * LastEvaluatedKey があるページは、次の呼び出しで ExclusiveStartKey を受け取る。
   */
  function respondWithPages(pages: Pages): void {
    const served: Record<string, number> = {};
    mockDocClient.send.mockImplementation(async (command: QueryCommand) => {
      const partition = command.input.ExpressionAttributeValues?.[':pk'] as string;
      const index = served[partition] ?? 0;
      served[partition] = index + 1;
      const items = pages[partition]?.[index] ?? [];
      const hasNext = index + 1 < (pages[partition]?.length ?? 0);
      return {
        Items: items,
        ...(hasNext ? { LastEvaluatedKey: { PK: partition, SK: `page-${index}` } } : {}),
      };
    });
  }

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();

    // Mock DynamoDB Document Client
    mockDocClient = {
      send: jest.fn(),
    };
    (awsClients.getDynamoDBDocumentClient as jest.Mock).mockReturnValue(mockDocClient);
    (awsClients.getTableName as jest.Mock).mockReturnValue('test-table');

    // Mock event
    mockEvent = {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: '2024-01-15T09:00:00Z',
      region: 'ap-northeast-1',
      resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
      detail: {},
    };
  });

  describe('正常系: 有効なサブスクリプションのみが存在する場合', () => {
    it('すべてのサブスクリプションが有効な場合、統計情報を返す', async () => {
      respondWithPages({
        'ALERT#MINUTE_LEVEL': [[toItem(buildAlert('alert-1'))]],
        'ALERT#HOURLY_LEVEL': [[toItem(buildAlert('alert-2', { frequency: 'HOURLY_LEVEL' }))]],
      });

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('日次バッチ処理が正常に完了しました');
      expect(body.statistics.totalAlerts).toBe(2);
      expect(body.statistics.validSubscriptions).toBe(2);
      expect(body.statistics.invalidSubscriptions).toBe(0);
    });

    it('旧属性名 subscription で保存されたアラートも検証の対象になる', async () => {
      const legacy = toItem(buildAlert('alert-1'));
      legacy.subscription = legacy.Subscription;
      delete legacy.Subscription;
      respondWithPages({ 'ALERT#MINUTE_LEVEL': [[legacy]] });

      const response = await handler(mockEvent);

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(1);
      expect(body.statistics.validSubscriptions).toBe(1);
    });
  });

  describe('全アラートの取得', () => {
    it('Scan ではなく、両方の頻度の AlertIndex を Query する', async () => {
      respondWithPages({});

      await handler(mockEvent);

      const commands = mockDocClient.send.mock.calls.map(([command]) => command);
      expect(commands.some((command) => command instanceof ScanCommand)).toBe(false);
      expect(commands.every((command) => command instanceof QueryCommand)).toBe(true);
      expect(
        commands
          .map((command: QueryCommand) => command.input.ExpressionAttributeValues?.[':pk'])
          .sort()
      ).toEqual(['ALERT#HOURLY_LEVEL', 'ALERT#MINUTE_LEVEL']);
      for (const command of commands as QueryCommand[]) {
        expect(command.input).toMatchObject({ TableName: 'test-table', IndexName: 'AlertIndex' });
      }
    });

    it('LastEvaluatedKey が返る限りページを辿り、複数ページの全件を数える', async () => {
      respondWithPages({
        'ALERT#MINUTE_LEVEL': [
          [toItem(buildAlert('alert-1')), toItem(buildAlert('alert-2'))],
          [toItem(buildAlert('alert-3'))],
          [toItem(buildAlert('alert-4'))],
        ],
        'ALERT#HOURLY_LEVEL': [
          [toItem(buildAlert('alert-5', { frequency: 'HOURLY_LEVEL' }))],
          [toItem(buildAlert('alert-6', { frequency: 'HOURLY_LEVEL' }))],
        ],
      });

      const response = await handler(mockEvent);

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(6);
      expect(body.statistics.validSubscriptions).toBe(6);
      // MINUTE_LEVEL 3 ページ + HOURLY_LEVEL 2 ページ
      expect(mockDocClient.send).toHaveBeenCalledTimes(5);
      const secondPageQueries = mockDocClient.send.mock.calls
        .map(([command]) => command as QueryCommand)
        .filter((command) => command.input.ExclusiveStartKey !== undefined);
      expect(secondPageQueries).toHaveLength(3);
    });
  });

  describe('正常系: 無効なサブスクリプションが存在する場合', () => {
    it('無効なサブスクリプションを検出してログ出力する', async () => {
      respondWithPages({
        'ALERT#MINUTE_LEVEL': [
          [
            // 有効なサブスクリプション
            toItem(buildAlert('alert-1')),
            // 無効なサブスクリプション: 不正なURL形式
            toItem(
              buildAlert('alert-3', {
                subscription: {
                  endpoint: 'invalid-url',
                  keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
                },
              })
            ),
          ],
        ],
        'ALERT#HOURLY_LEVEL': [
          [
            // 無効なサブスクリプション: Endpoint が空白のみ
            toItem(
              buildAlert('alert-2', {
                frequency: 'HOURLY_LEVEL',
                subscription: {
                  endpoint: '  ',
                  keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
                },
              })
            ),
          ],
        ],
      });

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(3);
      expect(body.statistics.validSubscriptions).toBe(1);
      expect(body.statistics.invalidSubscriptions).toBe(2);
    });

    it('Mapper が読めないアラート (endpoint が空文字など) は、件数に含めず警告ログだけを残す', async () => {
      respondWithPages({
        'ALERT#MINUTE_LEVEL': [
          [
            toItem(buildAlert('alert-1')),
            toItem(
              buildAlert('alert-2', {
                subscription: {
                  endpoint: '',
                  keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
                },
              })
            ),
          ],
        ],
      });

      const response = await handler(mockEvent);

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(1);
      expect(body.statistics.invalidSubscriptions).toBe(0);
    });
  });

  describe('正常系: アラートが存在しない場合', () => {
    it('アラートが0件の場合、統計情報を返す', async () => {
      respondWithPages({});

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(0);
      expect(body.statistics.validSubscriptions).toBe(0);
      expect(body.statistics.invalidSubscriptions).toBe(0);
    });
  });

  describe('異常系: DynamoDBエラー', () => {
    it('DynamoDBでエラーが発生した場合、エラー報告したうえで例外を再送出する', async () => {
      const dbError = new Error('DynamoDB Error');
      mockDocClient.send.mockRejectedValue(dbError);
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // リポジトリが DatabaseError に包むため、原因のメッセージは残るが同一の例外ではない
      await expect(handler(mockEvent)).rejects.toThrow('DynamoDB Error');
      expect(awsClients.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: '日次バッチ: 致命的エラー',
          message: expect.stringContaining('DynamoDB Error'),
        })
      );
    });
  });

  describe('エッジケース: サブスクリプションキーが空白', () => {
    it.each([
      ['p256dh', { p256dh: ' ', auth: 'test-auth' }],
      ['auth', { p256dh: 'test-p256dh', auth: ' ' }],
    ])('%s が空白のみの場合、無効と判定する', async (_name, keys) => {
      respondWithPages({
        'ALERT#MINUTE_LEVEL': [
          [
            toItem(
              buildAlert('alert-1', {
                subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys },
              })
            ),
          ],
        ],
      });

      const response = await handler(mockEvent);

      const body = JSON.parse(response.body);
      expect(body.statistics.invalidSubscriptions).toBe(1);
    });
  });
});
