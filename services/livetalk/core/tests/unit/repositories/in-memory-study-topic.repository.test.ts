import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryStudyTopicRepository } from '../../../src/repositories/in-memory-study-topic.repository.js';
import type { CreateStudyTopicInput } from '../../../src/entities/study-topic.entity.js';

const baseNow = 1_700_000_000_000;

function makeInput(overrides: Partial<CreateStudyTopicInput> = {}): CreateStudyTopicInput {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'tp1',
    topic: 'モンスターハンター',
    priority: 10,
    status: 'pending',
    ...overrides,
  };
}

describe('InMemoryStudyTopicRepository', () => {
  let now: number;
  let store: InMemorySingleTableStore;
  let repo: InMemoryStudyTopicRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryStudyTopicRepository(store, () => now);
  });

  // ── put ──

  it('put で新規登録できる', async () => {
    const item = await repo.put(makeInput());
    expect(item.userId).toBe('u1');
    expect(item.topic).toBe('モンスターハンター');
    expect(item.status).toBe('pending');
    expect(item.createdAt).toBe(baseNow);
    expect(item.updatedAt).toBe(baseNow);
  });

  it('put で expiresAt を TTL 属性のエポック秒で保存できる', async () => {
    const expiresAt = baseNow + 30 * 24 * 60 * 60 * 1000;
    const item = await repo.put(makeInput({ expiresAt }));
    expect(item.expiresAt).toBe(expiresAt);
    expect(store.get('USER#u1', 'CHAR#hiyori#STUDY#tp1')?.TTL).toBe(Math.floor(expiresAt / 1000));
  });

  it('旧属性名 Ttl だけで保存された Item も読める', async () => {
    store.put({
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#STUDY#tp-legacy',
      Type: 'StudyTopic',
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'tp-legacy',
      Topic: 'モンスターハンター',
      Priority: 10,
      Status: 'pending',
      CreatedAt: baseNow,
      UpdatedAt: baseNow,
      Ttl: 1_700_086_400,
    });
    const items = await repo.listByStatus('u1', 'hiyori');
    expect(items[0].expiresAt).toBe(1_700_086_400_000);
  });

  // ── listByStatus ──

  it('listByStatus: status 未指定で全件取得', async () => {
    await repo.put(makeInput({ topicId: 'tp1', status: 'pending' }));
    await repo.put(makeInput({ topicId: 'tp2', status: 'done' }));
    const all = await repo.listByStatus('u1', 'hiyori');
    expect(all).toHaveLength(2);
  });

  it('listByStatus: pending のみ取得', async () => {
    await repo.put(makeInput({ topicId: 'tp1', status: 'pending' }));
    await repo.put(makeInput({ topicId: 'tp2', status: 'done' }));
    const pending = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].topicId).toBe('tp1');
  });

  it('listByStatus: priority 降順でソートされる', async () => {
    await repo.put(makeInput({ topicId: 'tp1', priority: 1, status: 'pending' }));
    await repo.put(makeInput({ topicId: 'tp2', priority: 10, status: 'pending' }));
    const items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(items[0].topicId).toBe('tp2'); // priority 10 が先
    expect(items[1].topicId).toBe('tp1');
  });

  it('listByStatus: 同 priority は createdAt 昇順', async () => {
    now = baseNow;
    await repo.put(makeInput({ topicId: 'tp1', priority: 5, status: 'pending' }));
    now = baseNow + 1000;
    await repo.put(makeInput({ topicId: 'tp2', priority: 5, status: 'pending' }));
    const items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(items[0].topicId).toBe('tp1'); // createdAt が早い方が先
  });

  it('listByStatus: 別ユーザーは混入しない', async () => {
    await repo.put(makeInput({ userId: 'u1', topicId: 'tp1' }));
    await repo.put(makeInput({ userId: 'u2', topicId: 'tp2' }));
    const u1Items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(u1Items).toHaveLength(1);
    expect(u1Items[0].userId).toBe('u1');
  });

  // ── updateStatus ──

  it('updateStatus で status を変更できる', async () => {
    await repo.put(makeInput({ topicId: 'tp1', status: 'pending' }));
    now = baseNow + 5000;
    const updated = await repo.updateStatus({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'tp1',
      status: 'done',
      priority: 10,
    });
    expect(updated.status).toBe('done');
    expect(updated.updatedAt).toBe(baseNow + 5000);
  });

  it('updateStatus: expiresAt を渡すと更新し、旧属性名 Ttl を消す', async () => {
    store.put({
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#STUDY#tp-legacy',
      Type: 'StudyTopic',
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'tp-legacy',
      Topic: 'モンスターハンター',
      Priority: 10,
      Status: 'pending',
      CreatedAt: baseNow,
      UpdatedAt: baseNow,
      Ttl: 1_700_086_400,
    });
    const expiresAt = baseNow + 2 * 86_400_000;
    const updated = await repo.updateStatus({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'tp-legacy',
      status: 'done',
      priority: 10,
      expiresAt,
    });
    expect(updated.expiresAt).toBe(expiresAt);
    const item = store.get('USER#u1', 'CHAR#hiyori#STUDY#tp-legacy');
    expect(item?.TTL).toBe(Math.floor(expiresAt / 1000));
    expect(item).not.toHaveProperty('Ttl');
  });

  it('updateStatus: 存在しない topicId は EntityNotFoundError で、欠けたアイテムを作らない', async () => {
    await expect(
      repo.updateStatus({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'nonexistent',
        status: 'done',
        priority: 1,
      })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(store.get('USER#u1', 'CHAR#hiyori#STUDY#nonexistent')).toBeUndefined();
  });

  // ── findPendingByTopic ──

  it('pending のトピックが見つかる', async () => {
    await repo.put(makeInput({ topicId: 'tp1', topic: 'モンハン', status: 'pending' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).not.toBeNull();
    expect(found!.topicId).toBe('tp1');
  });

  it('in_progress のトピックも見つかる（重複防止対象）', async () => {
    await repo.put(makeInput({ topicId: 'tp1', topic: 'モンハン', status: 'in_progress' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).not.toBeNull();
  });

  it('done のトピックは見つからない', async () => {
    await repo.put(makeInput({ topicId: 'tp1', topic: 'モンハン', status: 'done' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).toBeNull();
  });

  it('大文字小文字を無視してマッチ', async () => {
    await repo.put(makeInput({ topicId: 'tp1', topic: 'JavaScript', status: 'pending' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'javascript');
    expect(found).not.toBeNull();
  });

  it('存在しないトピックは null を返す', async () => {
    const found = await repo.findPendingByTopic('u1', 'hiyori', '存在しない');
    expect(found).toBeNull();
  });
});
