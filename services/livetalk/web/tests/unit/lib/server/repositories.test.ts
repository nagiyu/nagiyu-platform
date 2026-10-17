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
    const l1 = mod.getLifecycleRepository();
    expect(p1).toBeDefined();
    expect(c1).toBeDefined();
    expect(l1).toBeDefined();

    // Phase 5b 配線: StudyTopic も取得できる（Knowledge は P5 で撤去済み）
    const s1 = mod.getStudyTopicRepository();
    const s2 = mod.getStudyTopicRepository();
    expect(s1).toBe(s2);

    // Phase 5c 配線: Note も取得できる
    const n1 = mod.getNoteRepository();
    const n2 = mod.getNoteRepository();
    expect(n1).toBe(n2);

    // リブトーク知識再設計 P2 配線: Topic（SELF fact 一覧・忘却で使用）も取得できる
    const t1 = mod.getTopicRepository();
    const t2 = mod.getTopicRepository();
    expect(t1).toBe(t2);

    const push1 = mod.getPushSubscriptionRepository();
    expect(push1).toBeDefined();
    const notif1 = mod.getNotificationEventRepository();
    expect(notif1).toBeDefined();
    const acctDeletion1 = mod.getAccountDeletionRepository();
    expect(acctDeletion1).toBeDefined();
  });

  it('InMemory 実装では Note を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    const repo = mod.getNoteRepository();
    await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      noteId: 'note-1',
      topicId: 'topic-1',
      subject: 'コーヒーの効能',
      headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
    });
    const list = await repo.list('u1', 'hiyori');
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe('コーヒーの効能');
    mod.resetRepositoriesForTesting();
  });

  it('InMemory 実装では StudyTopic を保存して status 別に取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    const repo = mod.getStudyTopicRepository();
    await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'tp1',
      topic: 'モンスターハンター',
      priority: 10,
      status: 'pending',
    });
    const pending = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].topic).toBe('モンスターハンター');
    mod.resetRepositoriesForTesting();
  });

  it('InMemory 実装では Message を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    const repo = mod.getMessageRepository();
    const saved = await repo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: 'hi',
    });
    const got = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: saved.messageId,
    });
    expect(got?.text).toBe('hi');
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
    expect(() => mod.getLifecycleRepository()).not.toThrow();
    expect(() => mod.getStudyTopicRepository()).not.toThrow();
    expect(() => mod.getNoteRepository()).not.toThrow();
    expect(() => mod.getTopicRepository()).not.toThrow();
    expect(() => mod.getPushSubscriptionRepository()).not.toThrow();
    expect(() => mod.getNotificationEventRepository()).not.toThrow();
    expect(() => mod.getAccountDeletionRepository()).not.toThrow();
    mod.resetRepositoriesForTesting();
  });

  it('InMemory 実装では Topic を保存して SELF fact を列挙できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const mod = await import('@/lib/server/repositories');
    mod.resetRepositoriesForTesting();
    const repo = mod.getTopicRepository();
    const topic = await repo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      subject: '好きな食べ物',
      canonicalSummary: '',
      category: 'preference',
      care: 1,
      embedding: [],
    });
    await repo.putSelfFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topic.topicId,
      text: 'カレーが好き',
      provenance: '',
    });
    const headers = await repo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    const facts = await repo.listSelfFacts('u1', 'hiyori', topic.topicId);
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe('カレーが好き');
    mod.resetRepositoriesForTesting();
  });
});
