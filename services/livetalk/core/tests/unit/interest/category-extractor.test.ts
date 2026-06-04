import { InMemorySingleTableStore } from '@nagiyu/aws';
import { persistInterestCategories } from '../../../src/interest/category-extractor.js';
import { InMemoryInterestRepository } from '../../../src/repositories/in-memory-interest.repository.js';
import type { IEmbeddingClient } from '../../../src/llm-client/types.js';

/**
 * 直交するベクトルを返す（インデックスごとに一方向に立つ）embedding スタブ。
 * 同じ map に登録された 2 つの単語は同じベクトル（cosine=1.0）になる。
 */
function buildEmbeddingClient(map: Record<string, number[]>): IEmbeddingClient & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async embed(text: string) {
      calls.push(text);
      const v = map[text];
      if (!v) {
        // 未登録は完全ランダムに近い無関係ベクトル
        return [0, 0, 0, 1];
      }
      return v;
    },
  };
}

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
      get: repo.get.bind(repo),
      list: repo.list.bind(repo),
      delete: repo.delete.bind(repo),
      update: repo.update.bind(repo),
      put: jest.fn(async (input: Parameters<typeof repo.put>[0]) => {
        if (input.Category === 'error') throw new Error('DB error');
        return repo.put(input);
      }),
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

  describe('dedup（embedding ベース）', () => {
    it('完全一致は dedupOptions 指定時も weight を累積する', async () => {
      const embeddingClient = buildEmbeddingClient({});
      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient,
      });
      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 2 }], repo, {
        embeddingClient,
      });
      const item = await repo.get('u1', 'hiyori', 'コーヒー');
      expect(item?.Weight).toBe(3);
    });

    it('embedding が類似閾値以上の場合は既存カテゴリに統合する', async () => {
      // 「コーヒー」と「コーヒー・飲み物」を同一方向ベクトルとする
      const embeddingClient = buildEmbeddingClient({
        コーヒー: [1, 0, 0],
        'コーヒー・飲み物': [1, 0, 0],
      });

      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient,
      });
      await persistInterestCategories(
        'u1',
        'hiyori',
        [{ category: 'コーヒー・飲み物', weight: 2 }],
        repo,
        { embeddingClient }
      );

      const all = await repo.list('u1', 'hiyori');
      expect(all).toHaveLength(1);
      expect(all[0].Category).toBe('コーヒー');
      expect(all[0].Weight).toBe(3);
    });

    it('embedding が類似閾値未満なら別カテゴリとして新規 put する', async () => {
      const embeddingClient = buildEmbeddingClient({
        コーヒー: [1, 0, 0],
        サッカー: [0, 1, 0],
      });

      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient,
      });
      await persistInterestCategories('u1', 'hiyori', [{ category: 'サッカー', weight: 1 }], repo, {
        embeddingClient,
      });

      const all = await repo.list('u1', 'hiyori');
      expect(all).toHaveLength(2);
    });

    it('新規 put 時に embedding が保存される', async () => {
      const vec = [0.5, 0.5, 0];
      const embeddingClient = buildEmbeddingClient({ コーヒー: vec });

      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient,
      });

      const item = await repo.get('u1', 'hiyori', 'コーヒー');
      expect(item?.Embedding).toEqual(vec);
    });

    it('既存項目の Embedding が無い場合はバックフィルする', async () => {
      // 旧データを Embedding 無しで投入
      await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: 'コーヒー',
        Weight: 1,
      });

      const embeddingClient = buildEmbeddingClient({
        コーヒー: [1, 0, 0],
        'コーヒー・飲み物': [1, 0, 0],
      });

      // 別表記が来たら統合される（既存の Embedding はバックフィルされる）
      await persistInterestCategories(
        'u1',
        'hiyori',
        [{ category: 'コーヒー・飲み物', weight: 2 }],
        repo,
        { embeddingClient }
      );

      const item = await repo.get('u1', 'hiyori', 'コーヒー');
      expect(item?.Weight).toBe(3);
      expect(item?.Embedding).toEqual([1, 0, 0]);
    });

    it('閾値オプションを上書きできる（厳しめに設定すると統合されない）', async () => {
      // cosine = 0.9（[1,0] vs [0.9, sqrt(1-0.81)] = [0.9, 0.4359]）
      const embeddingClient = buildEmbeddingClient({
        コーヒー: [1, 0],
        飲み物: [0.9, 0.4359],
      });

      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient,
        similarityThreshold: 0.99,
      });
      await persistInterestCategories('u1', 'hiyori', [{ category: '飲み物', weight: 1 }], repo, {
        embeddingClient,
        similarityThreshold: 0.99,
      });

      const all = await repo.list('u1', 'hiyori');
      expect(all).toHaveLength(2);
    });

    it('embedding クライアントがエラーを返しても致命的にならず新規 put する', async () => {
      const failingClient: IEmbeddingClient = {
        async embed() {
          throw new Error('embedding 失敗');
        },
      };

      await persistInterestCategories('u1', 'hiyori', [{ category: 'コーヒー', weight: 1 }], repo, {
        embeddingClient: failingClient,
      });

      const item = await repo.get('u1', 'hiyori', 'コーヒー');
      expect(item).not.toBeNull();
      expect(item?.Weight).toBe(1);
      expect(item?.Embedding).toBeUndefined();
    });

    it('複数の類似カテゴリのうち最も類似度が高いものに統合する', async () => {
      const embeddingClient = buildEmbeddingClient({
        映画: [1, 0, 0],
        映画鑑賞: [0.95, 0.05, 0],
        音楽: [0, 1, 0],
      });

      await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: '映画',
        Weight: 5,
        Embedding: [1, 0, 0],
      });
      await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: '音楽',
        Weight: 1,
        Embedding: [0, 1, 0],
      });

      await persistInterestCategories('u1', 'hiyori', [{ category: '映画鑑賞', weight: 2 }], repo, {
        embeddingClient,
      });

      const movie = await repo.get('u1', 'hiyori', '映画');
      const music = await repo.get('u1', 'hiyori', '音楽');
      expect(movie?.Weight).toBe(7);
      expect(music?.Weight).toBe(1);
      // 「映画鑑賞」は単独項目としては作成されない
      const standalone = await repo.get('u1', 'hiyori', '映画鑑賞');
      expect(standalone).toBeNull();
    });
  });
});
