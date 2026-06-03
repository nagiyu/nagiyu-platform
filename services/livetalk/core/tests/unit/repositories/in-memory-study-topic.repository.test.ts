import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryStudyTopicRepository } from '../../../src/repositories/in-memory-study-topic.repository.js';
import type { CreateStudyTopicInput } from '../../../src/entities/study-topic.entity.js';

const baseNow = 1_700_000_000_000;

function makeInput(overrides: Partial<CreateStudyTopicInput> = {}): CreateStudyTopicInput {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'tp1',
    Topic: 'モンスターハンター',
    Priority: 10,
    Status: 'pending',
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
    expect(item.UserID).toBe('u1');
    expect(item.Topic).toBe('モンスターハンター');
    expect(item.Status).toBe('pending');
    expect(item.CreatedAt).toBe(baseNow);
    expect(item.UpdatedAt).toBe(baseNow);
  });

  it('put で TTL を保存できる', async () => {
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const item = await repo.put(makeInput({ Ttl: ttl }));
    expect(item.Ttl).toBe(ttl);
  });

  // ── listByStatus ──

  it('listByStatus: status 未指定で全件取得', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Status: 'pending' }));
    await repo.put(makeInput({ TopicID: 'tp2', Status: 'done' }));
    const all = await repo.listByStatus('u1', 'hiyori');
    expect(all).toHaveLength(2);
  });

  it('listByStatus: pending のみ取得', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Status: 'pending' }));
    await repo.put(makeInput({ TopicID: 'tp2', Status: 'done' }));
    const pending = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].TopicID).toBe('tp1');
  });

  it('listByStatus: Priority 降順でソートされる', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Priority: 1, Status: 'pending' }));
    await repo.put(makeInput({ TopicID: 'tp2', Priority: 10, Status: 'pending' }));
    const items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(items[0].TopicID).toBe('tp2'); // Priority 10 が先
    expect(items[1].TopicID).toBe('tp1');
  });

  it('listByStatus: 同 Priority は CreatedAt 昇順', async () => {
    now = baseNow;
    await repo.put(makeInput({ TopicID: 'tp1', Priority: 5, Status: 'pending' }));
    now = baseNow + 1000;
    await repo.put(makeInput({ TopicID: 'tp2', Priority: 5, Status: 'pending' }));
    const items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(items[0].TopicID).toBe('tp1'); // CreatedAt が早い方が先
  });

  it('listByStatus: 別ユーザーは混入しない', async () => {
    await repo.put(makeInput({ UserID: 'u1', TopicID: 'tp1' }));
    await repo.put(makeInput({ UserID: 'u2', TopicID: 'tp2' }));
    const u1Items = await repo.listByStatus('u1', 'hiyori', 'pending');
    expect(u1Items).toHaveLength(1);
    expect(u1Items[0].UserID).toBe('u1');
  });

  // ── updateStatus ──

  it('updateStatus で Status を変更できる', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Status: 'pending' }));
    now = baseNow + 5000;
    const updated = await repo.updateStatus({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'tp1',
      Status: 'done',
      Priority: 10,
    });
    expect(updated.Status).toBe('done');
    expect(updated.UpdatedAt).toBe(baseNow + 5000);
  });

  it('updateStatus: 存在しない TopicID は例外', async () => {
    await expect(
      repo.updateStatus({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'nonexistent',
        Status: 'done',
        Priority: 1,
      })
    ).rejects.toThrow();
  });

  // ── findPendingByTopic ──

  it('pending のトピックが見つかる', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Topic: 'モンハン', Status: 'pending' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).not.toBeNull();
    expect(found!.TopicID).toBe('tp1');
  });

  it('in_progress のトピックも見つかる（重複防止対象）', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Topic: 'モンハン', Status: 'in_progress' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).not.toBeNull();
  });

  it('done のトピックは見つからない', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Topic: 'モンハン', Status: 'done' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンハン');
    expect(found).toBeNull();
  });

  it('大文字小文字を無視してマッチ', async () => {
    await repo.put(makeInput({ TopicID: 'tp1', Topic: 'JavaScript', Status: 'pending' }));
    const found = await repo.findPendingByTopic('u1', 'hiyori', 'javascript');
    expect(found).not.toBeNull();
  });

  it('存在しないトピックは null を返す', async () => {
    const found = await repo.findPendingByTopic('u1', 'hiyori', '存在しない');
    expect(found).toBeNull();
  });
});
