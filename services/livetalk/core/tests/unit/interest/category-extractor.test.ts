import { InMemorySingleTableStore } from '@nagiyu/aws';
import { persistInterestCategories } from '../../../src/interest/category-extractor.js';
import { InMemoryInterestRepository } from '../../../src/repositories/in-memory-interest.repository.js';

describe('persistInterestCategories', () => {
  let repo: InMemoryInterestRepository;

  beforeEach(() => {
    repo = new InMemoryInterestRepository(new InMemorySingleTableStore());
  });

  it('存在しないカテゴリを新規 put する', async () => {
    await persistInterestCategories('u1', 'hiyori', [{ category: 'アニメ', weight: 2 }], repo);
    const item = await repo.get('u1', 'hiyori', 'アニメ');
    expect(item).not.toBeNull();
    expect(item?.Weight).toBe(2);
  });

  it('既存カテゴリは weight を累積する', async () => {
    await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo);
    await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 3 }], repo);
    const item = await repo.get('u1', 'hiyori', 'コーヒー');
    expect(item?.Weight).toBe(4);
  });

  it('複数カテゴリを一括処理できる', async () => {
    await persistInterestCategories(
      'u1',
      'hiyori',
      [
        { category: 'アニメ', weight: 2 },
        { category: '音楽', weight: 1 },
      ],
      repo
    );
    const all = await repo.list('u1', 'hiyori');
    expect(all).toHaveLength(2);
  });

  it('weight が 0 以下のエントリはスキップする', async () => {
    await persistInterestCategories('u1', 'hiyori', [{ category: 'test', weight: 0 }], repo);
    const item = await repo.get('u1', 'hiyori', 'test');
    expect(item).toBeNull();
  });

  it('category が空文字のエントリはスキップする', async () => {
    await persistInterestCategories('u1', 'hiyori', [{ category: '', weight: 1 }], repo);
    const all = await repo.list('u1', 'hiyori');
    expect(all).toHaveLength(0);
  });

  it('リポジトリエラーが発生しても他エントリの処理を継続する', async () => {
    const errRepo = {
      ...repo,
      get: jest.fn(async (uid: string, cid: string, cat: string) => {
        if (cat === 'error') throw new Error('DB error');
        return repo.get(uid, cid, cat);
      }),
      put: jest.fn(async (input: Parameters<typeof repo.put>[0]) => repo.put(input)),
      update: jest.fn(async (entity: Parameters<typeof repo.update>[0]) => repo.update(entity)),
      list: repo.list.bind(repo),
      delete: repo.delete.bind(repo),
    };

    await persistInterestCategories(
      'u1',
      'hiyori',
      [
        { category: 'error', weight: 1 },
        { category: '正常', weight: 2 },
      ],
      errRepo
    );

    const item = await repo.get('u1', 'hiyori', '正常');
    expect(item?.Weight).toBe(2);
  });
});
