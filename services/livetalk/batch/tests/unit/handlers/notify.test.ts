import type { ScheduledEvent } from '../../../src/handlers/notify.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBProfileRepository: jest.fn(),
  DynamoDBLifecycleRepository: jest.fn(),
  DynamoDBMessageRepository: jest.fn(),
  DynamoDBKnowledgeRepository: jest.fn(),
  DynamoDBNotificationEventRepository: jest.fn(),
  DynamoDBPushSubscriptionRepository: jest.fn(),
  DynamoDBInterestRepository: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(() => ({ embed: jest.fn() })),
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

  it('notifyAllUsers が throw した場合に 500 を返す', async () => {
    mockNotifyAll.mockRejectedValue(new Error('DynamoDB 障害'));

    const { handler } = await import('../../../src/handlers/notify.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('DynamoDB 障害');
  });

  it('reportErrorEvent が 500 時に呼ばれる', async () => {
    mockNotifyAll.mockRejectedValue(new Error('致命的エラー'));
    const { reportErrorEvent } = jest.requireMock('@nagiyu/aws');

    const { handler } = await import('../../../src/handlers/notify.js');
    await handler(makeEvent());

    expect(reportErrorEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
