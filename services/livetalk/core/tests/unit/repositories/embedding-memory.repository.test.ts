import { EmbeddingMemoryRepository } from '../../../src/repositories/embedding-memory.repository.js';
import type { IEmbeddingClient } from '../../../src/llm-client/types.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { CreateMemoryInput, MemoryEntity } from '../../../src/entities/memory.entity.js';

const MOCK_EMBEDDING = [0.1, 0.2, 0.3];

const baseInput: CreateMemoryInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 0,
};

const savedEntity: MemoryEntity = {
  ...baseInput,
  MemoryID: 'mem-001',
  CreatedAt: 1_750_000_000_000,
  UpdatedAt: 1_750_000_000_000,
};

function makeInner(): MemoryRepository {
  return {
    put: jest.fn(async () => savedEntity),
    get: jest.fn(async () => null),
    listByTier: jest.fn(async () => []),
    listByCategory: jest.fn(async () => []),
    update: jest.fn(async () => savedEntity),
    delete: jest.fn(async () => undefined),
    promote: jest.fn(async () => savedEntity),
    demote: jest.fn(async () => savedEntity),
  } as unknown as MemoryRepository;
}

function makeEmbeddingClient(vec: number[] = MOCK_EMBEDDING): IEmbeddingClient {
  return { embed: jest.fn(async () => vec) };
}

describe('EmbeddingMemoryRepository', () => {
  describe('put', () => {
    it('embedding を生成して inner.put に渡す', async () => {
      const inner = makeInner();
      const embeddingClient = makeEmbeddingClient();
      const repo = new EmbeddingMemoryRepository(inner, embeddingClient);

      await repo.put(baseInput);

      expect(embeddingClient.embed).toHaveBeenCalledWith(baseInput.Content);
      expect(inner.put).toHaveBeenCalledWith(
        expect.objectContaining({ Embedding: MOCK_EMBEDDING })
      );
    });

    it('embedding 生成失敗時は embedding なしで inner.put を呼ぶ（fail-warn）', async () => {
      const inner = makeInner();
      const failingClient: IEmbeddingClient = {
        embed: jest.fn(async () => {
          throw new Error('API 障害');
        }),
      };
      const repo = new EmbeddingMemoryRepository(inner, failingClient);

      await expect(repo.put(baseInput)).resolves.not.toThrow();
      expect(inner.put).toHaveBeenCalledWith(
        expect.not.objectContaining({ Embedding: MOCK_EMBEDDING })
      );
    });

    it('入力に既存 Embedding があっても生成した embedding で上書きする', async () => {
      const inner = makeInner();
      const embeddingClient = makeEmbeddingClient([0.9, 0.8, 0.7]);
      const repo = new EmbeddingMemoryRepository(inner, embeddingClient);

      await repo.put({ ...baseInput, Embedding: [0.0, 0.0, 0.0] });

      expect(inner.put).toHaveBeenCalledWith(
        expect.objectContaining({ Embedding: [0.9, 0.8, 0.7] })
      );
    });
  });

  describe('promote', () => {
    it('promote 時に embedding を再生成する', async () => {
      const inner = makeInner();
      const embeddingClient = makeEmbeddingClient();
      const repo = new EmbeddingMemoryRepository(inner, embeddingClient);

      await repo.promote(savedEntity, 'A');

      expect(embeddingClient.embed).toHaveBeenCalledWith(savedEntity.Content);
      expect(inner.promote).toHaveBeenCalledWith(
        expect.objectContaining({ Embedding: MOCK_EMBEDDING }),
        'A'
      );
    });

    it('embedding 生成失敗時は既存 embedding のまま promote する', async () => {
      const entityWithEmbedding = { ...savedEntity, Embedding: [0.5, 0.5] };
      const inner = makeInner();
      const failingClient: IEmbeddingClient = {
        embed: jest.fn(async () => {
          throw new Error('API 障害');
        }),
      };
      const repo = new EmbeddingMemoryRepository(inner, failingClient);

      await expect(repo.promote(entityWithEmbedding, 'A')).resolves.not.toThrow();
      expect(inner.promote).toHaveBeenCalledWith(
        expect.objectContaining({ Embedding: [0.5, 0.5] }),
        'A'
      );
    });
  });

  describe('demote', () => {
    it('demote は embedding 再生成なしに inner.demote を呼ぶ', async () => {
      const inner = makeInner();
      const embeddingClient = makeEmbeddingClient();
      const repo = new EmbeddingMemoryRepository(inner, embeddingClient);

      await repo.demote(savedEntity, 'C');

      expect(embeddingClient.embed).not.toHaveBeenCalled();
      expect(inner.demote).toHaveBeenCalledWith(savedEntity, 'C');
    });
  });

  describe('委譲メソッド', () => {
    it('get は inner に委譲する', async () => {
      const inner = makeInner();
      const repo = new EmbeddingMemoryRepository(inner, makeEmbeddingClient());
      const key = {
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B' as const,
        category: 'food',
        memoryId: 'mem-001',
      };
      await repo.get(key);
      expect(inner.get).toHaveBeenCalledWith(key);
    });

    it('listByTier は inner に委譲する', async () => {
      const inner = makeInner();
      const repo = new EmbeddingMemoryRepository(inner, makeEmbeddingClient());
      await repo.listByTier('u1', 'hiyori', 'B');
      expect(inner.listByTier).toHaveBeenCalledWith('u1', 'hiyori', 'B');
    });

    it('update は inner に委譲する', async () => {
      const inner = makeInner();
      const repo = new EmbeddingMemoryRepository(inner, makeEmbeddingClient());
      const input = {
        UserID: 'u1',
        CharacterID: 'hiyori',
        Tier: 'B' as const,
        Category: 'food',
        MemoryID: 'mem-001',
        Content: '更新',
      };
      await repo.update(input);
      expect(inner.update).toHaveBeenCalledWith(input);
    });

    it('delete は inner に委譲する', async () => {
      const inner = makeInner();
      const repo = new EmbeddingMemoryRepository(inner, makeEmbeddingClient());
      const key = {
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B' as const,
        category: 'food',
        memoryId: 'mem-001',
      };
      await repo.delete(key);
      expect(inner.delete).toHaveBeenCalledWith(key);
    });
  });
});
