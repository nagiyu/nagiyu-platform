import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateKnowledgeInput, KnowledgeEntity } from '../entities/knowledge.entity.js';
import { KnowledgeMapper } from '../mappers/knowledge.mapper.js';
import { buildKnowledgeSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { KnowledgeRepository } from './knowledge.repository.interface.js';

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly mapper: KnowledgeMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new KnowledgeMapper();
  }

  public async put(input: CreateKnowledgeInput): Promise<KnowledgeEntity> {
    const now = this.nowMs();
    const entity: KnowledgeEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async list(userId: string, characterId: string, limit = 100): Promise<KnowledgeEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildKnowledgeSKPrefix(characterId);
    // store.query に limit を渡さず全件取得し、CreatedAt 降順でソート後に limit を適用する。
    // InMemorySingleTableStore は挿入順で返すため、先に limit を適用すると
    // 最新アイテムが取りこぼされる可能性がある。
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    return result.items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.CreatedAt - a.CreatedAt)
      .slice(0, limit);
  }

  public async getLatest(userId: string, characterId: string): Promise<KnowledgeEntity | null> {
    const all = await this.list(userId, characterId, 1);
    return all[0] ?? null;
  }
}
