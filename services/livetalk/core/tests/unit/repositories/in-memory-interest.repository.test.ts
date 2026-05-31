import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryInterestRepository } from '../../../src/repositories/in-memory-interest.repository.js';

describe('InMemoryInterestRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryInterestRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryInterestRepository(store, () => now);
  });

  it('未登録なら get は null を返す', async () => {
    expect(await repo.get('u1', 'hiyori', 'アニメ')).toBeNull();
  });

  it('put で新規作成できる', async () => {
    const item = await repo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Category: 'アニメ',
      Weight: 3,
    });
    expect(item.UserID).toBe('u1');
    expect(item.Weight).toBe(3);
    expect(item.CreatedAt).toBe(baseNow);
  });

  it('同 PK/SK に再 put しても CreatedAt は変わらない', async () => {
    await repo.put({ UserID: 'u1', CharacterID: 'hiyori', Category: 'アニメ', Weight: 1 });
    now += 5000;
    const second = await repo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Category: 'アニメ',
      Weight: 2,
    });
    expect(second.CreatedAt).toBe(baseNow);
    expect(second.UpdatedAt).toBe(baseNow + 5000);
  });

  it('update で Weight を変更できる', async () => {
    const item = await repo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Category: 'アニメ',
      Weight: 1,
    });
    now += 1000;
    const updated = await repo.update({ ...item, Weight: 10 });
    expect(updated.Weight).toBe(10);
    expect(updated.UpdatedAt).toBe(baseNow + 1000);
  });

  it('list でキャラ単位の全件を返す', async () => {
    await repo.put({ UserID: 'u1', CharacterID: 'hiyori', Category: 'アニメ', Weight: 1 });
    await repo.put({ UserID: 'u1', CharacterID: 'hiyori', Category: 'コーヒー', Weight: 2 });
    await repo.put({ UserID: 'u2', CharacterID: 'hiyori', Category: 'アニメ', Weight: 3 });
    const list = await repo.list('u1', 'hiyori');
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.Category).sort()).toEqual(['アニメ', 'コーヒー'].sort());
  });

  it('delete で削除される', async () => {
    await repo.put({ UserID: 'u1', CharacterID: 'hiyori', Category: 'アニメ', Weight: 1 });
    await repo.delete({ userId: 'u1', characterId: 'hiyori', category: 'アニメ' });
    expect(await repo.get('u1', 'hiyori', 'アニメ')).toBeNull();
  });

  it('list は空のユーザーに対して空配列を返す', async () => {
    const list = await repo.list('unknown', 'hiyori');
    expect(list).toHaveLength(0);
  });
});
