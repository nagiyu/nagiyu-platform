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
  DynamoDBMessageRepository: jest.fn(),
  DynamoDBLifecycleRepository: jest.fn(),
  DynamoDBProfileRepository: jest.fn(),
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

describe('learn-user-activity handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockLearnAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    await expect(handler(makeEvent({ id: 'ev-999' }))).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'ユーザー活動時間学習バッチ: 致命的エラー',
      })
    );
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
