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
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: Date.now(),
    });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('初回 upsert で LastInteractionAt を保存する', async () => {
    const state = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: now,
    });
    expect(state.UserID).toBe('u1');
    expect(state.CharacterID).toBe('hiyori');
    expect(state.LastInteractionAt).toBe(baseNow);
    expect(state.CreatedAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持しつつ LastInteractionAt / UpdatedAt を更新する', async () => {
    await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: now,
    });

    now += 5000;
    const updated = await repo.upsert(
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        LastInteractionAt: now,
      },
      { LastInteractionAt: now }
    );
    expect(updated.LastInteractionAt).toBe(baseNow + 5000);
    expect(updated.UpdatedAt).toBe(baseNow + 5000);
    expect(updated.CreatedAt).toBe(baseNow);
  });

  it('getById は未登録なら null', async () => {
    expect(await repo.getById({ userId: 'u1', characterId: 'hiyori' })).toBeNull();
  });

  it('複数キャラを分けて保持できる', async () => {
    await repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', LastInteractionAt: now });
    now += 1;
    await repo.upsert({ UserID: 'u1', CharacterID: 'other', LastInteractionAt: now });
    const a = await repo.getById({ userId: 'u1', characterId: 'hiyori' });
    const b = await repo.getById({ userId: 'u1', characterId: 'other' });
    expect(a?.LastInteractionAt).toBe(baseNow);
    expect(b?.LastInteractionAt).toBe(baseNow + 1);
  });

  it('AffectionLevel / Onboarded などの Phase 3 以降のフィールドは保持されない', async () => {
    const state = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: now,
    });
    expect(Object.keys(state).sort()).toEqual(
      ['CharacterID', 'CreatedAt', 'LastInteractionAt', 'UpdatedAt', 'UserID'].sort()
    );
  });
});
