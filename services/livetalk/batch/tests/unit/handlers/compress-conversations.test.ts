import type { ScheduledEvent } from '../../../src/handlers/compress-conversations.js';

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
  DynamoDBInterestRepository: jest.fn(),
  DynamoDBCharacterStateRepository: jest.fn(),
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

    const { handler } = await import('../../../src/handlers/compress-conversations.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedUsers).toBe(5);
  });

  it('例外発生時に throw する', async () => {
    mockCompressAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/compress-conversations.js');
    await expect(handler(makeEvent())).rejects.toThrow('DynamoDB 接続エラー');
  });

  it('例外発生時に reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockCompressAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/compress-conversations.js');
    await expect(handler(makeEvent({ id: 'ev-999' }))).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '圧縮要約バッチ: 致命的エラー',
      })
    );
  });

  it('部分失敗（failedUsers > 0）時に throw し reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockCompressAll.mockResolvedValue({
      processedUsers: 1,
      skippedUsers: 0,
      failedUsers: 1,
      failedUserIds: ['u1'],
    });

    const { handler } = await import('../../../src/handlers/compress-conversations.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '圧縮要約バッチ: 部分失敗',
      })
    );
  });
});
