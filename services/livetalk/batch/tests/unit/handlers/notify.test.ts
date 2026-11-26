import type { InMemoryErrorEventWriter, ScheduledEvent } from '@nagiyu/aws';
import { createErrorEventWriter, resetErrorEventWriter } from '@nagiyu/aws';

// 骨格 (createScheduledHandler) は実物を使い、副作用のある DynamoDB 取得だけを差し替える。
// エラー報告は in-memory の書き込み先に入る
jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  createProfileRepository: jest.fn(),
  createFreshnessCheckRequestRepository: jest.fn(),
  createLifecycleRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createNotificationEventRepository: jest.fn(),
  createPushSubscriptionRepository: jest.fn(),
  createTopicRepository: jest.fn(),
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

/** 報告された ErrorEvent を取り出す */
function getReportedEvents() {
  return (createErrorEventWriter() as InMemoryErrorEventWriter).getRecords();
}

describe('notify handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = 'test-error-events';
    resetErrorEventWriter();
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
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

  it('例外発生時に エラーを報告する', async () => {
    mockNotifyAll.mockRejectedValue(new Error('致命的エラー'));

    const { handler } = await import('../../../src/handlers/notify.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(getReportedEvents()).toEqual([
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '通知バッチ: 致命的エラー',
      }),
    ]);
  });
});
