import type { MigratePayload } from '../../../src/usecases/migrate.usecase.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBTopicRepository: jest.fn(),
  DynamoDBProfileRepository: jest.fn(),
  OpenAIClient: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockRunMigration = jest.fn();
jest.mock('../../../src/usecases/migrate.usecase.js', () => ({
  runMigration: (...args: unknown[]) => mockRunMigration(...args),
}));

const makeEvent = (overrides: Partial<MigratePayload> = {}): MigratePayload => ({
  targetUserId: 'u1',
  characterId: 'hiyori',
  dryRun: true,
  ...overrides,
});

describe('migrate handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常処理時に 200 を返す', async () => {
    mockRunMigration.mockResolvedValue({
      processedScopes: 1,
      failedScopes: 0,
      failedScopeKeys: [],
      scopeReports: [],
    });

    const { handler } = await import('../../../src/handlers/migrate.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.processedScopes).toBe(1);
  });

  it('runMigration にペイロードをそのまま渡す', async () => {
    mockRunMigration.mockResolvedValue({
      processedScopes: 0,
      failedScopes: 0,
      failedScopeKeys: [],
      scopeReports: [],
    });

    const { handler } = await import('../../../src/handlers/migrate.js');
    const event = makeEvent({ targetUserId: 'ALL', dryRun: false, migrate: true });
    await handler(event);

    expect(mockRunMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: event,
      })
    );
  });

  it('例外発生時に throw し reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockRunMigration.mockRejectedValue(
      new Error('一回性移行: 本番環境での破壊的操作には confirmEnv="prod" の指定が必要です')
    );

    const { handler } = await import('../../../src/handlers/migrate.js');
    await expect(handler(makeEvent({ dryRun: false }))).rejects.toThrow('confirmEnv');

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '一回性移行バッチ: 致命的エラー',
      })
    );
  });

  it('部分失敗（failedScopes > 0）時に throw し reportErrorEvent を呼ぶ', async () => {
    const { reportErrorEvent } = await import('@nagiyu/aws');
    mockRunMigration.mockResolvedValue({
      processedScopes: 1,
      failedScopes: 1,
      failedScopeKeys: ['u1#hiyori'],
      scopeReports: [],
    });

    const { handler } = await import('../../../src/handlers/migrate.js');
    await expect(handler(makeEvent())).rejects.toThrow();

    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: '一回性移行バッチ: 部分失敗',
      })
    );
  });
});
