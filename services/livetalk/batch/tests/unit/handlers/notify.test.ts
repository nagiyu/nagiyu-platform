import type { ScheduledEvent } from '@nagiyu/aws';

// 骨格 (createScheduledHandler) は実物を使い、副作用のある DynamoDB 取得とエラー報告だけを差し替える
jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));
jest.mock('../../../../../../libs/aws/src/error-events/report.js', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBProfileRepository: jest.fn(),
  DynamoDBLifecycleRepository: jest.fn(),
  DynamoDBMessageRepository: jest.fn(),
  DynamoDBNotificationEventRepository: jest.fn(),
  DynamoDBPushSubscriptionRepository: jest.fn(),
  DynamoDBTopicRepository: jest.fn(),
  createLLMClient: jest.fn(() => ({})),
  defaultUlidFactory: jest.fn(),
}));

const mockNotifyAll = jest.fn();
jest.mock('../../../src/usecases/notify.usecase.js', () => ({
  notifyAllUsers: (...args: unknown[]) => mockNotifyAll(...args),
}));

function makeEvent(overrides: Partial<ScheduledEvent> = {}): ScheduledEvent {
  return {
    version: '0',
    id: 'event-001',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2026-06-01T00:30:00Z',
    region: 'us-east-1',
    resources: [],
    detail: {},
    ...overrides,
  };
}

describe('notify handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常処理時に 200 を返し結果を body に含める', async () => {
    mockNotifyAll.mockResolvedValue({
      notifiedUsers: 3,
      skippedUsers: 2,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/notify.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.notifiedUsers).toBe(3);
    expect(body.skippedUsers).toBe(2);
  });

  it('notifyAllUsers が throw した場合に元の例外を再送出する', async () => {
    mockNotifyAll.mockRejectedValue(new Error('DynamoDB 障害'));

    const { handler } = await import('../../../src/handlers/notify.js');
    await expect(handler(makeEvent())).rejects.toThrow('DynamoDB 障害');
  });

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    mockNotifyAll.mockRejectedValue(new Error('致命的エラー'));
    const { reportErrorEvent } = await import('@nagiyu/aws');

    const { handler } = await import('../../../src/handlers/notify.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '通知バッチ: 致命的エラー',
      })
    );
  });
});
