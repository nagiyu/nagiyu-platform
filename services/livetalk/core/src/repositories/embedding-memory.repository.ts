import { logger } from '@nagiyu/common';
import type { IEmbeddingClient } from '../llm-client/types.js';
import type {
  CreateMemoryInput,
  MemoryEntity,
  MemoryKey,
  Tier,
  UpdateMemoryInput,
} from '../entities/memory.entity.js';
import type { MemoryListResult, MemoryRepository } from './memory.repository.interface.js';

/**
 * MemoryRepository の Decorator。
 *
 * `put` / `promote` 時に embedding を自動生成して保存する。
 * 生成に失敗した場合は embedding なしで保存を継続する（fail-warn）。
 */
export class EmbeddingMemoryRepository implements MemoryRepository {
  private readonly inner: MemoryRepository;
  private readonly embeddingClient: IEmbeddingClient;

  constructor(inner: MemoryRepository, embeddingClient: IEmbeddingClient) {
    this.inner = inner;
    this.embeddingClient = embeddingClient;
  }

  public async put(input: CreateMemoryInput): Promise<MemoryEntity> {
    const embedding = await this.generateEmbedding(input.Content);
    return this.inner.put({ ...input, Embedding: embedding ?? input.Embedding });
  }

  public async get(key: MemoryKey): Promise<MemoryEntity | null> {
    return this.inner.get(key);
  }

  public async listByTier(
    userId: string,
    characterId: string,
    tier: Tier
  ): Promise<MemoryListResult> {
    return this.inner.listByTier(userId, characterId, tier);
  }

  public async listByCategory(
    userId: string,
    characterId: string,
    category: string
  ): Promise<MemoryEntity[]> {
    return this.inner.listByCategory(userId, characterId, category);
  }

  public async update(input: UpdateMemoryInput): Promise<MemoryEntity> {
    return this.inner.update(input);
  }

  public async delete(key: MemoryKey): Promise<void> {
    return this.inner.delete(key);
  }

  public async promote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    const embedding = await this.generateEmbedding(memory.Content);
    const target = embedding ? { ...memory, Embedding: embedding } : memory;
    return this.inner.promote(target, toTier);
  }

  public async demote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    return this.inner.demote(memory, toTier);
  }

  private async generateEmbedding(text: string): Promise<number[] | undefined> {
    try {
      return await this.embeddingClient.embed(text);
    } catch (err) {
      logger.warn(
        '[EmbeddingMemoryRepository] embedding 生成に失敗しました（embedding なしで保存）',
        {
          err,
        }
      );
      return undefined;
    }
  }
}
