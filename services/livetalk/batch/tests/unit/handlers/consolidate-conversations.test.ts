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
  createTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createWebRawRepository: jest.fn(),
  createConsolidationCursorRepository: jest.fn(),
  createProfileRepository: jest.fn(),
  createNoteRepository: jest.fn(),
  createNoteSkipRepository: jest.fn(),
  OpenAIClient: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockConsolidateAll = jest.fn();
jest.mock('../../../src/usecases/consolidate-conversations.usecase.js', () => ({
  consolidateAllConversations: (...args: unknown[]) => mockConsolidateAll(...args),
}));

const makeEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  version: '0',
  id: 'event-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789',
  time: '2026-07-08T00:15:00Z',
  region: 'ap-northeast-1',
  resources: [],
  detail: {},
  ...overrides,
});

/** 報告された ErrorEvent を取り出す */
function getReportedEvents() {
  return (createErrorEventWriter() as InMemoryErrorEventWriter).getRecords();
}

describe('consolidate-conversations handler', () => {
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
    mockConsolidateAll.mockResolvedValue({
      processedUsers: 5,
      skippedUsers: 0,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/consolidate-conversations.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedUsers).toBe(5);
  });

  it('例外発生時に throw する', async () => {
    mockConsolidateAll.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const { handler } = await import('../../../src/handlers/consolidate-conversations.js');
    await expect(handler(makeEvent())).rejects.toThrow('DynamoDB 接続エラー');
  });

  it('例外発生時に エラーを報告する', async () => {
    mockConsolidateAll.mockRejectedValue(new Error('fatal'));

    const { handler } = await import('../../../src/handlers/consolidate-conversations.js');
    await expect(handler(makeEvent({ id: 'ev-999' }))).rejects.toThrow();

    expect(getReportedEvents()).toEqual([
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '集約バッチ: 致命的エラー',
      }),
    ]);
  });

  it('部分失敗（failedUsers > 0）時に throw しエラーを報告する', async () => {
    mockConsolidateAll.mockResolvedValue({
      processedUsers: 1,
      skippedUsers: 0,
      failedUsers: 1,
      failedUserIds: ['u1'],
    });

    const { handler } = await import('../../../src/handlers/consolidate-conversations.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(getReportedEvents()).toEqual([
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '集約バッチ: 部分失敗',
      }),
    ]);
    expect(JSON.parse(getReportedEvents()[0].context)).toEqual(
      expect.objectContaining({ failedUserIds: ['u1'] })
    );
  });
});
