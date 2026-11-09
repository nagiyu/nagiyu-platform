import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  ExplorationEntity,
  ExplorationKey,
  PutExplorationInput,
} from '../entities/exploration.entity.js';
import { ExplorationMapper } from '../mappers/exploration.mapper.js';
import { buildExplorationSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { ExplorationRepository } from './exploration.repository.interface.js';

export class InMemoryExplorationRepository implements ExplorationRepository {
  private readonly mapper = new ExplorationMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly entityStore: EntityStore<ExplorationEntity, ExplorationKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: PutExplorationInput): Promise<ExplorationEntity> {
    return this.entityStore.put(input);
  }

  public async listAll(userId: string, characterId: string): Promise<ExplorationEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildExplorationSKPrefix(characterId);
    return this.store
      .queryAll({ pk, sk: { operator: 'begins_with', value: prefix } })
      .map((item) => this.mapper.toEntity(item));
  }

  public async delete(key: ExplorationKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
