import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { Highlight, HighlightKey, UpdateHighlightInput } from '../types.js';
import type { HighlightRepository } from './highlight.repository.interface.js';
import {
  HIGHLIGHT_SK_PREFIX,
  HighlightMapper,
  buildHighlightPk,
} from '../mappers/highlight.mapper.js';

/**
 * InMemory Highlight Repository
 *
 * DynamoDB 版と同じ Mapper・同じ EntityStore の振る舞いを使う。テスト環境で使用
 */
export class InMemoryHighlightRepository implements HighlightRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new HighlightMapper();
  private readonly entityStore: EntityStore<Highlight, HighlightKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async getByJobId(jobId: string): Promise<Highlight[]> {
    // DynamoDB 版は全ページを辿るため、ここもページ上限なしで全件を取る
    const { items } = this.store.query(
      { pk: buildHighlightPk(jobId), sk: { operator: 'begins_with', value: HIGHLIGHT_SK_PREFIX } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    return items.map((item) => this.mapper.toEntity(item)).sort((a, b) => a.order - b.order);
  }

  public async getById(jobId: string, highlightId: string): Promise<Highlight | null> {
    return this.entityStore.get({ jobId, highlightId });
  }

  public async update(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput
  ): Promise<Highlight> {
    return this.entityStore.update({ jobId, highlightId }, updates);
  }

  public async createMany(highlights: Highlight[]): Promise<void> {
    await Promise.all(highlights.map((highlight) => this.entityStore.put(highlight)));
  }
}
