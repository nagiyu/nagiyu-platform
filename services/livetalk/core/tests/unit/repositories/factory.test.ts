import {
  createAccountDeletionRepository,
  createCharacterStateRepository,
  createChatGuardRepository,
  createConsolidationCursorRepository,
  createLifecycleRepository,
  createMessageRepository,
  createNoteRepository,
  createNotificationEventRepository,
  createProfileRepository,
  createPushSubscriptionRepository,
  createStudyTopicRepository,
  createTopicRepository,
  createWebRawRepository,
  resetRepositoryFactories,
} from '../../../src/repositories/factory.js';
import { DynamoDBMessageRepository } from '../../../src/repositories/dynamodb-message.repository.js';
import { DynamoDBWebRawRepository } from '../../../src/repositories/dynamodb-webraw.repository.js';
import { InMemoryMessageRepository } from '../../../src/repositories/in-memory-message.repository.js';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';

describe('repositories/factory', () => {
  const originalFlag = process.env.USE_IN_MEMORY_DB;
  const originalTable = process.env.DYNAMODB_TABLE_NAME;

  beforeEach(() => {
    resetRepositoryFactories();
  });

  afterEach(() => {
    resetRepositoryFactories();
    if (originalFlag === undefined) delete process.env.USE_IN_MEMORY_DB;
    else process.env.USE_IN_MEMORY_DB = originalFlag;
    if (originalTable === undefined) delete process.env.DYNAMODB_TABLE_NAME;
    else process.env.DYNAMODB_TABLE_NAME = originalTable;
  });

  it('USE_IN_MEMORY_DB=true なら InMemory リポジトリをシングルトンで返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const message = createMessageRepository();
    expect(message).toBeInstanceOf(InMemoryMessageRepository);
    expect(createMessageRepository()).toBe(message);

    const webRaw = createWebRawRepository();
    expect(webRaw).toBeInstanceOf(InMemoryWebRawRepository);
    expect(createWebRawRepository()).toBe(webRaw);

    const factories = [
      createAccountDeletionRepository,
      createCharacterStateRepository,
      createChatGuardRepository,
      createConsolidationCursorRepository,
      createLifecycleRepository,
      createNoteRepository,
      createNotificationEventRepository,
      createProfileRepository,
      createPushSubscriptionRepository,
      createStudyTopicRepository,
      createTopicRepository,
    ];
    for (const create of factories) {
      const repo = create();
      expect(repo).toBeDefined();
      expect(create()).toBe(repo);
    }
  });

  it('InMemory 実装では Note を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const repo = createNoteRepository();
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
  });

  it('InMemory 実装では StudyTopic を保存して status 別に取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const repo = createStudyTopicRepository();
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
  });

  it('InMemory 実装では Message を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const repo = createMessageRepository();
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
  });

  it('InMemory 実装では WebRaw を保存して取得できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const repo = createWebRawRepository();
    const saved = await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー',
      rawText: '本文',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });
    const list = await repo.listSince('u1', 'hiyori', 0);
    expect(list.map((r) => r.rawId)).toEqual([saved.rawId]);
  });

  it('resetRepositoryFactories で次回取得時は別インスタンスになる', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const before = createMessageRepository();
    resetRepositoryFactories();
    const after = createMessageRepository();
    expect(before).not.toBe(after);
  });

  it('DynamoDB モード（引数の docClient / tableName 明示）で DynamoDB 実装を返す', () => {
    delete process.env.USE_IN_MEMORY_DB;
    const docClient = { send: jest.fn() } as never;

    expect(createMessageRepository(docClient, 'nagiyu-livetalk-test')).toBeInstanceOf(
      DynamoDBMessageRepository
    );
    expect(createWebRawRepository(docClient, 'nagiyu-livetalk-test')).toBeInstanceOf(
      DynamoDBWebRawRepository
    );
  });

  it('DynamoDB モード（USE_IN_MEMORY_DB 未設定 + テーブル名を環境変数で指定）でも生成できる', () => {
    delete process.env.USE_IN_MEMORY_DB;
    process.env.DYNAMODB_TABLE_NAME = 'nagiyu-livetalk-test';

    expect(() => createMessageRepository()).not.toThrow();
    expect(() => createProfileRepository()).not.toThrow();
    expect(() => createCharacterStateRepository()).not.toThrow();
    expect(() => createLifecycleRepository()).not.toThrow();
    expect(() => createStudyTopicRepository()).not.toThrow();
    expect(() => createNoteRepository()).not.toThrow();
    expect(() => createTopicRepository()).not.toThrow();
    expect(() => createPushSubscriptionRepository()).not.toThrow();
    expect(() => createNotificationEventRepository()).not.toThrow();
    expect(() => createAccountDeletionRepository()).not.toThrow();
    expect(() => createChatGuardRepository()).not.toThrow();
    expect(() => createConsolidationCursorRepository()).not.toThrow();
    expect(() => createWebRawRepository()).not.toThrow();
  });

  it('InMemory 実装ではアカウント削除がチャットガードのカウンタとロックも消す（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const guard = createChatGuardRepository();
    expect(createChatGuardRepository()).toBe(guard);

    const nowMs = Date.now();
    await guard.incrementRateLimit('u1', '1m', nowMs);
    await guard.acquireLock('u1', 'token-a', 60_000, nowMs);

    await createAccountDeletionRepository().deleteAccount('u1');

    expect((await guard.incrementRateLimit('u1', '1m', nowMs)).count).toBe(1);
    expect((await guard.acquireLock('u1', 'token-b', 60_000, nowMs)).acquired).toBe(true);
  });

  it('InMemory 実装では Topic を保存して SELF fact を列挙できる（共有 store 検証）', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const repo = createTopicRepository();
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
  });
});
