import type { ScheduledEvent } from '../../../src/handlers/acquire.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBTopicRepository: jest.fn(),
  DynamoDBWebRawRepository: jest.fn(),
  DynamoDBStudyTopicRepository: jest.fn(),
  DynamoDBLifecycleRepository: jest.fn(),
  DynamoDBProfileRepository: jest.fn(),
  OpenAIResearchClient: jest.fn(),
  OpenAIClient: jest.fn(),
  LLMWebFactChangeDetector: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockAcquireAll = jest.fn();
jest.mock('../../../src/usecases/acquire.usecase.js', () => ({
  acquireAllUsers: (...args: unknown[]) => mockAcquireAll(...args),
}));

const makeEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  version: '0',
  id: 'event-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789',
  time: '2026-07-08T00:45:00Z',
  region: 'ap-northeast-1',
  resources: [],
  detail: {},
  ...overrides,
});

describe('acquire handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常処理時に 200 を返す', async () => {
    mockAcquireAll.mockResolvedValue({
      processedUsers: 5,
      skippedUsers: 0,
      failedUsers: 0,
      failedUserIds: [],
      requestsProcessed: 3,
      staleRefreshed: 2,
      staleChanged: 1,
      selfStudied: 1,
      webRawWritten: 5,
    });

    const { handler } = await import('../../../src/handlers/acquire.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedUsers).toBe(5);
    expect(body.webRawWritten).toBe(5);
  });

  it('例外発生時に throw する', async () => {
    mockAcquireAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/acquire.js');
    await expect(handler(makeEvent())).rejects.toThrow('DynamoDB 接続エラー');
  });

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockAcquireAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/acquire.js');
    await expect(handler(makeEvent({ id: 'ev-999' }))).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'acquire バッチ: 致命的エラー',
      })
    );
  });

  it('部分失敗（failedUsers > 0）時に throw し reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockAcquireAll.mockResolvedValue({
      processedUsers: 1,
      skippedUsers: 0,
      failedUsers: 1,
      failedUserIds: ['u1'],
      requestsProcessed: 0,
      staleRefreshed: 0,
      staleChanged: 0,
      selfStudied: 0,
      webRawWritten: 0,
    });

    const { handler } = await import('../../../src/handlers/acquire.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'acquire バッチ: 部分失敗',
      })
    );
  });
});
