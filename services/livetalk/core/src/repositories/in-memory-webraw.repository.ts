import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import { WEBRAW_TTL_SECONDS } from '../constants.js';
import type { CreateWebRawInput, WebRawEntity } from '../entities/webraw.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { WebRawMapper } from '../mappers/webraw.mapper.js';
import { buildUserPK, buildWebRawSKPrefix } from '../mappers/keys.js';
import type { WebRawRepository } from './webraw.repository.interface.js';

export class InMemoryWebRawRepository implements WebRawRepository {
  private readonly mapper: WebRawMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.mapper = new WebRawMapper();
  }

  public async put(input: CreateWebRawInput): Promise<WebRawEntity> {
    const now = this.nowMs();
    const rawId = input.RawID ?? this.ulidFactory(now);

    const entity: WebRawEntity = {
      ...input,
      RawID: rawId,
      CreatedAt: now,
    };

    const item: DynamoDBItem & { TTL: number } = {
      ...this.mapper.toItem(entity),
      TTL: Math.floor(now / 1000) + WEBRAW_TTL_SECONDS,
    };

    this.store.put(item);
    return entity;
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
