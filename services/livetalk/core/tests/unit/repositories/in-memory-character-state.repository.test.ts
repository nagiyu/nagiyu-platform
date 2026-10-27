import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryCharacterStateRepository } from '../../../src/repositories/in-memory-character-state.repository.js';

describe('InMemoryCharacterStateRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryCharacterStateRepository;
  const baseNow = 1_700_000_000_000;
  let now = baseNow;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryCharacterStateRepository(store, () => now);
  });

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const localStore = new InMemorySingleTableStore();
    const repo = new InMemoryCharacterStateRepository(localStore);
    const before = Date.now();
    const result = await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      lastInteractionAt: Date.now(),
    });
    expect(result.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('初回 upsert で LastInteractionAt を保存する', async () => {
    const state = await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      lastInteractionAt: now,
    });
    expect(state.userId).toBe('u1');
    expect(state.characterId).toBe('hiyori');
    expect(state.lastInteractionAt).toBe(baseNow);
    expect(state.createdAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持しつつ LastInteractionAt / UpdatedAt を更新する', async () => {
    await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      lastInteractionAt: now,
    });

    now += 5000;
    const updated = await repo.upsert(
      {
        userId: 'u1',
        characterId: 'hiyori',
        lastInteractionAt: now,
      },
      { lastInteractionAt: now }
    );
    expect(updated.lastInteractionAt).toBe(baseNow + 5000);
    expect(updated.updatedAt).toBe(baseNow + 5000);
    expect(updated.createdAt).toBe(baseNow);
  });

  it('getById は未登録なら null', async () => {
    expect(await repo.getById({ userId: 'u1', characterId: 'hiyori' })).toBeNull();
  });

  it('複数キャラを分けて保持できる', async () => {
    await repo.upsert({ userId: 'u1', characterId: 'hiyori', lastInteractionAt: now });
    now += 1;
    await repo.upsert({ userId: 'u1', characterId: 'other', lastInteractionAt: now });
    const a = await repo.getById({ userId: 'u1', characterId: 'hiyori' });
    const b = await repo.getById({ userId: 'u1', characterId: 'other' });
    expect(a?.lastInteractionAt).toBe(baseNow);
    expect(b?.lastInteractionAt).toBe(baseNow + 1);
  });

  it('AffectionLevel を指定して upsert すると保存される', async () => {
    const state = await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      lastInteractionAt: now,
      affectionLevel: 5,
    });
    expect(state.affectionLevel).toBe(5);
  });

  it('AffectionLevel 未指定の upsert では 0 になる', async () => {
    const state = await repo.upsert({
      userId: 'u1',
      characterId: 'hiyori',
      lastInteractionAt: now,
    });
    expect(state.affectionLevel).toBe(0);
  });

  it('updateAffection で AffectionLevel が加算される', async () => {
    await repo.upsert({ userId: 'u1', characterId: 'hiyori', lastInteractionAt: now });
    const result = await repo.updateAffection('u1', 'hiyori', 2);
    expect(result.affectionLevel).toBe(2);
  });

  it('updateAffection を複数回呼ぶと累積される', async () => {
    await repo.updateAffection('u1', 'hiyori', 1);
    await repo.updateAffection('u1', 'hiyori', 1.5);
    const state = await repo.getById({ userId: 'u1', characterId: 'hiyori' });
    expect(state?.affectionLevel).toBeCloseTo(2.5);
  });

  it('updateAffection は負の delta でも下がらない（上昇のみ保証）', async () => {
    await repo.updateAffection('u1', 'hiyori', 5);
    await repo.updateAffection('u1', 'hiyori', -3);
    const state = await repo.getById({ userId: 'u1', characterId: 'hiyori' });
    expect(state?.affectionLevel).toBe(5);
  });

  it('updateAffection は CharacterState 未作成でも動作する', async () => {
    const result = await repo.updateAffection('new', 'hiyori', 1);
    expect(result.affectionLevel).toBe(1);
  });
});
