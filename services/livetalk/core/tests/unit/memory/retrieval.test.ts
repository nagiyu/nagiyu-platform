import { MemoryRetriever } from '../../../src/memory/retrieval.js';
import type { IEmbeddingClient } from '../../../src/llm-client/types.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';

// 1536 次元で互いに直交する単純なテスト用ベクトル
const VEC_COFFEE = [1, 0, 0];
const VEC_SPORTS = [0, 1, 0];
const VEC_MUSIC = [0, 0, 1];
const VEC_QUERY_COFFEE = [0.99, 0.01, 0]; // coffee に近い

const FIXED_NOW = 1_750_000_000_000;
const COOLDOWN_MS = 30 * 60 * 1000; // 30 分

function makeMemory(
  override: Partial<MemoryEntity> & { MemoryID: string; Content: string; Category: string }
): MemoryEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    Tier: 'B',
    Confidence: 0.8,
    ReferencedCount: 0,
    CreatedAt: FIXED_NOW - 10000,
    UpdatedAt: FIXED_NOW - 10000,
    ...override,
  };
}

function makeMemoryRepo(tierA: MemoryEntity[] = [], tierB: MemoryEntity[] = []): MemoryRepository {
  return {
    listByTier: jest.fn(async (_userId, _charId, tier) => {
      if (tier === 'A') return { items: tierA };
      if (tier === 'B') return { items: tierB };
      return { items: [] };
    }),
    put: jest.fn(),
    get: jest.fn(),
    listByCategory: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    promote: jest.fn(),
    demote: jest.fn(),
  } as unknown as MemoryRepository;
}

function makeEmbeddingClient(vec: number[]): IEmbeddingClient {
  return { embed: jest.fn(async () => vec) };
}

const defaultOptions = {
  userInput: 'コーヒー飲んだ',
  maxTierB: 5,
  cooldownMs: COOLDOWN_MS,
  categoryCapPerConversation: 1,
};

describe('MemoryRetriever', () => {
  describe('Tier A 取得', () => {
    it('Tier A は無条件で全件返す', async () => {
      const tierA = [
        makeMemory({ MemoryID: 'a1', Content: '名前は田中', Category: 'name', Tier: 'A' }),
        makeMemory({ MemoryID: 'a2', Content: '誕生日は3月', Category: 'birthday', Tier: 'A' }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo(tierA),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      const tierAResults = result.memories.filter((r) => r.memory.Tier === 'A');
      expect(tierAResults).toHaveLength(2);
      expect(tierAResults.every((r) => r.similarity === 1.0)).toBe(true);
    });

    it('Tier A は cooldown の影響を受けない', async () => {
      const recent = FIXED_NOW - 1000;
      const tierA = [
        makeMemory({
          MemoryID: 'a1',
          Content: '名前は田中',
          Category: 'name',
          Tier: 'A',
          LastReferencedAt: recent,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo(tierA),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      expect(result.memories.filter((r) => r.memory.Tier === 'A')).toHaveLength(1);
    });
  });

  describe('Tier B 取得', () => {
    it('embedding のある Tier B を cosine similarity で上位 N 件返す', async () => {
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
        makeMemory({
          MemoryID: 'b2',
          Content: 'スポーツ好き',
          Category: 'hobby',
          Embedding: VEC_SPORTS,
        }),
        makeMemory({
          MemoryID: 'b3',
          Content: '音楽好き',
          Category: 'hobby2',
          Embedding: VEC_MUSIC,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', { ...defaultOptions, maxTierB: 2 });
      const tierBResults = result.memories.filter((r) => r.memory.Tier === 'B');
      expect(tierBResults).toHaveLength(2);
      expect(tierBResults[0].memory.Content).toBe('コーヒー好き');
    });

    it('embedding が未設定の Memory はスキップされる', async () => {
      const tierB = [
        makeMemory({ MemoryID: 'b1', Content: 'コーヒー好き', Category: 'food' }),
        makeMemory({
          MemoryID: 'b2',
          Content: 'スポーツ好き',
          Category: 'hobby',
          Embedding: VEC_SPORTS,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      const tierBResults = result.memories.filter((r) => r.memory.Tier === 'B');
      expect(tierBResults).toHaveLength(1);
      expect(tierBResults[0].memory.Content).toBe('スポーツ好き');
    });
  });

  describe('cooldown 除外', () => {
    it('直近 cooldownMs 以内に参照された Tier B Memory は除外される', async () => {
      const recentRef = FIXED_NOW - COOLDOWN_MS + 1000;
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
          LastReferencedAt: recentRef,
        }),
        makeMemory({
          MemoryID: 'b2',
          Content: 'スポーツ好き',
          Category: 'hobby',
          Embedding: VEC_SPORTS,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      const tierBResults = result.memories.filter((r) => r.memory.Tier === 'B');
      expect(tierBResults).toHaveLength(1);
      expect(tierBResults[0].memory.Content).toBe('スポーツ好き');
    });

    it('cooldownMs を過ぎた Memory は除外されない', async () => {
      const oldRef = FIXED_NOW - COOLDOWN_MS - 1000;
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
          LastReferencedAt: oldRef,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      expect(result.memories.filter((r) => r.memory.Tier === 'B')).toHaveLength(1);
    });

    it('LastReferencedAt が未設定の Memory は cooldown 除外されない', async () => {
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      expect(result.memories.filter((r) => r.memory.Tier === 'B')).toHaveLength(1);
    });
  });

  describe('カテゴリキャップ', () => {
    it('同カテゴリから categoryCapPerConversation 件を超えて返さない', async () => {
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
        makeMemory({
          MemoryID: 'b2',
          Content: '紅茶も好き',
          Category: 'food',
          Embedding: [0.9, 0.1, 0],
        }),
        makeMemory({
          MemoryID: 'b3',
          Content: 'スポーツ好き',
          Category: 'hobby',
          Embedding: VEC_SPORTS,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', {
        ...defaultOptions,
        categoryCapPerConversation: 1,
      });
      const food = result.memories.filter((r) => r.memory.Tier === 'B' && r.memory.Category === 'food');
      expect(food).toHaveLength(1);
    });

    it('categoryCapPerConversation=2 なら同カテゴリ 2 件まで返す', async () => {
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
        makeMemory({
          MemoryID: 'b2',
          Content: '緑茶も好き',
          Category: 'food',
          Embedding: [0.9, 0.1, 0],
        }),
        makeMemory({
          MemoryID: 'b3',
          Content: '麦茶も',
          Category: 'food',
          Embedding: [0.8, 0.2, 0],
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo([], tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', {
        ...defaultOptions,
        categoryCapPerConversation: 2,
        maxTierB: 10,
      });
      const food = result.memories.filter((r) => r.memory.Tier === 'B' && r.memory.Category === 'food');
      expect(food).toHaveLength(2);
    });
  });

  describe('embedding 生成失敗時のフォールバック', () => {
    it('embedding 生成に失敗した場合は Tier A のみ返す', async () => {
      const tierA = [
        makeMemory({ MemoryID: 'a1', Content: '名前は田中', Category: 'name', Tier: 'A' }),
      ];
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
      ];
      const failingEmbedding: IEmbeddingClient = {
        embed: jest.fn(async () => {
          throw new Error('API 障害');
        }),
      };
      const retriever = new MemoryRetriever(
        makeMemoryRepo(tierA, tierB),
        failingEmbedding,
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].memory.Tier).toBe('A');
    });
  });

  describe('統合（Tier A + B の混在）', () => {
    it('Tier A と Tier B が両方返る', async () => {
      const tierA = [
        makeMemory({ MemoryID: 'a1', Content: '名前は田中', Category: 'name', Tier: 'A' }),
      ];
      const tierB = [
        makeMemory({
          MemoryID: 'b1',
          Content: 'コーヒー好き',
          Category: 'food',
          Embedding: VEC_COFFEE,
        }),
      ];
      const retriever = new MemoryRetriever(
        makeMemoryRepo(tierA, tierB),
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        () => FIXED_NOW
      );

      const result = await retriever.retrieve('u1', 'hiyori', defaultOptions);
      expect(result.memories.some((r) => r.memory.Tier === 'A')).toBe(true);
      expect(result.memories.some((r) => r.memory.Tier === 'B')).toBe(true);
    });
  });
});
