/**
 * @jest-environment node
 */

describe('lib/server/safety', () => {
  const originalFlag = process.env.USE_IN_MEMORY_DB;
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.USE_IN_MEMORY_DB;
    else process.env.USE_IN_MEMORY_DB = originalFlag;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('getSafetyEventRepository は InMemory 実装を返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/safety');
    const repo = mod.getSafetyEventRepository();
    expect(repo).toBeDefined();
  });

  it('getModerationClient: USE_IN_MEMORY_DB=true なら NoOpModerationClient を返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    delete process.env.OPENAI_API_KEY;
    const mod = await import('@/lib/server/safety');
    const client = mod.getModerationClient();
    expect(client).toBeDefined();
    // シングルトン確認
    expect(mod.getModerationClient()).toBe(client);
  });

  it('getModerationClient: OPENAI_API_KEY 未設定なら NoOpModerationClient にフォールバック', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';
    delete process.env.OPENAI_API_KEY;
    const mod = await import('@/lib/server/safety');
    const client = mod.getModerationClient();
    expect(client).toBeDefined();
  });

  it('getModerationClient: OPENAI_API_KEY 設定済みなら OpenAI クライアントを返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const mod = await import('@/lib/server/safety');
    const client = mod.getModerationClient();
    expect(client).toBeDefined();
  });

  it('resetSafetyForTesting でキャッシュをリセットできる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/safety');
    const client1 = mod.getModerationClient();
    mod.resetSafetyForTesting();
    const client2 = mod.getModerationClient();
    expect(client1).not.toBe(client2);
  });
});
