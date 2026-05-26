/**
 * @jest-environment node
 */

describe('lib/server/repositories', () => {
  const originalFlag = process.env.USE_IN_MEMORY_DB;
  const originalTable = process.env.DYNAMODB_TABLE_NAME;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.USE_IN_MEMORY_DB;
    else process.env.USE_IN_MEMORY_DB = originalFlag;
    if (originalTable === undefined) delete process.env.DYNAMODB_TABLE_NAME;
    else process.env.DYNAMODB_TABLE_NAME = originalTable;
  });

  it('USE_IN_MEMORY_DB=true なら InMemory リポジトリ群をシングルトンで返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    const r1 = mod.getMessageRepository();
    const r2 = mod.getMessageRepository();
    expect(r1).toBe(r2);

    const p1 = mod.getProfileRepository();
    const c1 = mod.getCharacterStateRepository();
    expect(p1).toBeDefined();
    expect(c1).toBeDefined();
  });

  it('InMemory 実装では Message を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    const repo = mod.getMessageRepository();
    const saved = await repo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'hi',
    });
    const got = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: saved.MessageID,
    });
    expect(got?.Text).toBe('hi');
    mod.resetRepositoriesForTesting();
  });

  it('resetRepositoriesForTesting で次回取得時は別インスタンスになる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    const before = mod.getMessageRepository();
    mod.resetRepositoriesForTesting();
    const after = mod.getMessageRepository();
    expect(before).not.toBe(after);
  });

  it('DynamoDB モード（USE_IN_MEMORY_DB 未設定 + テーブル名指定）でも生成できる', async () => {
    delete process.env.USE_IN_MEMORY_DB;
    process.env.DYNAMODB_TABLE_NAME = 'nagiyu-livetalk-test';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    expect(() => mod.getMessageRepository()).not.toThrow();
    expect(() => mod.getProfileRepository()).not.toThrow();
    expect(() => mod.getCharacterStateRepository()).not.toThrow();
    mod.resetRepositoriesForTesting();
  });
});
