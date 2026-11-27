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
  createMessageRepository: jest.fn(),
  createLifecycleRepository: jest.fn(),
  createProfileRepository: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockLearnAll = jest.fn();
jest.mock('../../../src/usecases/learn-user-activity.usecase.js', () => ({
  learnAllUserActivities: (...args: unknown[]) => mockLearnAll(...args),
}));

const makeEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  version: '0',
  id: 'event-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789',
  time: '2026-06-01T18:00:00Z',
  region: 'us-east-1',
  resources: [],
  detail: {},
  ...overrides,
});

/** 報告された ErrorEvent を取り出す */
function getReportedEvents() {
  return (createErrorEventWriter() as InMemoryErrorEventWriter).getRecords();
}

describe('learn-user-activity handler', () => {
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

  it('正常処理時に 200 を返す', async () => {
    mockLearnAll.mockResolvedValue({
      processedUsers: 3,
      skippedUsers: 1,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedUsers).toBe(3);
    expect(body.skippedUsers).toBe(1);
  });

  it('例外発生時に元の例外を再送出する', async () => {
    mockLearnAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    await expect(handler(makeEvent())).rejects.toThrow('DynamoDB 接続エラー');
  });

  it('例外発生時に エラーを報告する', async () => {
    mockLearnAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    await expect(handler(makeEvent({ id: 'ev-999' }))).rejects.toThrow();

    expect(getReportedEvents()).toEqual([
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'ユーザー活動時間学習バッチ: 致命的エラー',
      }),
    ]);
  });

  it('eventId が learnAllUserActivities に渡らなくても動作する', async () => {
    mockLearnAll.mockResolvedValue({
      processedUsers: 0,
      skippedUsers: 0,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    const response = await handler(makeEvent({ id: 'ev-special' }));
    expect(response.statusCode).toBe(200);
  });
});
