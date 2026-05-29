import type { ScheduledEvent } from '../../../src/handlers/compress-conversations.handler.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBMemorySummaryRepository: jest.fn(),
  DynamoDBMessageRepository: jest.fn(),
  DynamoDBMemoryRepository: jest.fn(),
  EmbeddingMemoryRepository: jest.fn(),
  OpenAIClient: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockCompressAll = jest.fn();
jest.mock('../../../src/usecases/compress-conversations.usecase.js', () => ({
  compressAllConversations: (...args: unknown[]) => mockCompressAll(...args),
}));

const makeEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  version: '0',
  id: 'event-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789',
  time: '2026-05-29T18:00:00Z',
  region: 'ap-northeast-1',
  resources: [],
  detail: {},
  ...overrides,
});

describe('compress-conversations handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常処理時に 200 を返す', async () => {
    mockCompressAll.mockResolvedValue({
      processedUsers: 5,
      skippedUsers: 0,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/compress-conversations.handler.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedUsers).toBe(5);
  });

  it('例外発生時に 500 を返す', async () => {
    mockCompressAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/compress-conversations.handler.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('DynamoDB 接続エラー');
  });

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockCompressAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/compress-conversations.handler.js');
    await handler(makeEvent({ id: 'ev-999' }));

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
      })
    );
  });
});
