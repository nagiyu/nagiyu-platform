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

  it('初回 upsert で AffectionLevel / Onboarded などを保存する', async () => {
    const state = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      AffectionLevel: 0,
      LastInteractionAt: now,
      Onboarded: false,
    });
    expect(state.AffectionLevel).toBe(0);
    expect(state.Onboarded).toBe(false);
    expect(state.CreatedAt).toBe(baseNow);
  });

  it('再 upsert は CreatedAt を保持しつつ UpdatedAt / フィールドを更新する', async () => {
    await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      AffectionLevel: 0,
      LastInteractionAt: now,
      Onboarded: false,
    });

    now += 5000;
    const updated = await repo.upsert(
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        AffectionLevel: 0,
        LastInteractionAt: now,
        Onboarded: false,
      },
      { AffectionLevel: 3, Onboarded: true, LastInteractionAt: now }
    );
    expect(updated.AffectionLevel).toBe(3);
    expect(updated.Onboarded).toBe(true);
    expect(updated.UpdatedAt).toBe(baseNow + 5000);
    expect(updated.CreatedAt).toBe(baseNow);
  });

  it('getById は未登録なら null', async () => {
    expect(await repo.getById({ userId: 'u1', characterId: 'hiyori' })).toBeNull();
  });

  it('複数キャラを分けて保持できる', async () => {
    await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      AffectionLevel: 1,
      LastInteractionAt: now,
      Onboarded: false,
    });
    await repo.upsert({
      UserID: 'u1',
      CharacterID: 'other',
      AffectionLevel: 5,
      LastInteractionAt: now,
      Onboarded: true,
    });
    const a = await repo.getById({ userId: 'u1', characterId: 'hiyori' });
    const b = await repo.getById({ userId: 'u1', characterId: 'other' });
    expect(a?.AffectionLevel).toBe(1);
    expect(b?.AffectionLevel).toBe(5);
  });
});
