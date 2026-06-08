import type { ScheduledEvent } from '../../../src/handlers/learn-user-activity.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBMessageRepository: jest.fn(),
  DynamoDBLifecycleRepository: jest.fn(),
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

  it('例外発生時に 500 を返す', async () => {
    mockLearnAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('DynamoDB 接続エラー');
  });

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockLearnAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/learn-user-activity.js');
    await handler(makeEvent({ id: 'ev-999' }));

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
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
