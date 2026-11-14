import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey,
  PutFreshnessCheckRequestInput,
} from '../entities/freshness-check-request.entity.js';
import { FreshnessCheckRequestMapper } from '../mappers/freshness-check-request.mapper.js';
import { buildFreshnessCheckRequestSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { FreshnessCheckRequestRepository } from './freshness-check-request.repository.interface.js';

export class InMemoryFreshnessCheckRequestRepository implements FreshnessCheckRequestRepository {
  private readonly mapper = new FreshnessCheckRequestMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly entityStore: EntityStore<FreshnessCheckRequestEntity, FreshnessCheckRequestKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: PutFreshnessCheckRequestInput): Promise<FreshnessCheckRequestEntity> {
    const { entity } = await this.entityStore.createIfAbsent(input);
    return entity;
  }

  public async listByCharacter(
    userId: string,
    characterId: string
  ): Promise<FreshnessCheckRequestEntity[]> {
    return this.store
      .queryAll({
        pk: buildUserPK(userId),
        sk: { operator: 'begins_with', value: buildFreshnessCheckRequestSKPrefix(characterId) },
      })
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async delete(key: FreshnessCheckRequestKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
