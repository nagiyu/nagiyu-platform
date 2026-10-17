import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import { WEBRAW_TTL_SECONDS } from '../constants.js';
import type { CreateWebRawInput, WebRawEntity, WebRawKey } from '../entities/webraw.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { WebRawMapper } from '../mappers/webraw.mapper.js';
import { buildUserPK, buildWebRawSKPrefix } from '../mappers/keys.js';
import type { WebRawRepository } from './webraw.repository.interface.js';

export class InMemoryWebRawRepository implements WebRawRepository {
  private readonly mapper: WebRawMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<WebRawEntity, WebRawKey>;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.mapper = new WebRawMapper();
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreateWebRawInput): Promise<WebRawEntity> {
    const now = this.nowMs();
    return this.entityStore.put({
      ...input,
      rawId: input.rawId ?? this.ulidFactory(now),
      createdAt: now,
      expiresAt: now + WEBRAW_TTL_SECONDS * 1000,
    });
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<WebRawEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildWebRawSKPrefix(characterId);

    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );

    const filtered = sinceMs > 0 ? items.filter((i) => (i.CreatedAt as number) > sinceMs) : items;
    const sorted = [...filtered].sort((a, b) => (a.SK < b.SK ? -1 : a.SK > b.SK ? 1 : 0));
    return sorted.map((i) => this.mapper.toEntity(i));
  }
}
