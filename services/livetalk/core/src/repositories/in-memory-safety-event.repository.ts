import {
  InMemoryEntityStore,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import type {
  CreateSafetyEventInput,
  SafetyEventEntity,
  SafetyEventKey,
  SafetyEventSummary,
} from '../entities/safety-event.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { buildSafetyEventGSI2PK, SAFETY_EVENT_GSI_PROJECTION } from '../mappers/keys.js';
import { SafetyEventMapper } from '../mappers/safety-event.mapper.js';
import type { SafetyEventRepository } from './safety-event.repository.interface.js';

export class InMemorySafetyEventRepository implements SafetyEventRepository {
  private readonly mapper = new SafetyEventMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<SafetyEventEntity, SafetyEventKey>;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async create(input: CreateSafetyEventInput): Promise<SafetyEventEntity> {
    const now = this.nowMs();
    return this.entityStore.create({
      ...input,
      eventId: input.eventId ?? this.ulidFactory(now),
      createdAt: now,
      updatedAt: now,
    });
  }

  public async getById(key: SafetyEventKey): Promise<SafetyEventEntity | null> {
    return this.entityStore.get(key);
  }

  public async listRecent(limit: number): Promise<SafetyEventSummary[]> {
    // GSI2PK='SAFETY' のアイテムを全件取得してから GSI2SK（EventID / ULID）の降順でソートし、
    // limit 件返す。queryByAttribute は既定 limit=100 でページングするため、cursor ループで
    // 全件集約しないと「最近の検出」を取り落とす（in-memory-profile.repository の listAllUserIds と同パターン）。
    const items: DynamoDBAttributes[] = [];
    let cursor: string | undefined;
    do {
      const result = this.store.queryByAttribute(
        {
          attributeName: 'GSI2PK',
          attributeValue: buildSafetyEventGSI2PK(),
          projection: SAFETY_EVENT_GSI_PROJECTION,
          // sk条件を指定しないため、実DynamoDBのGSI2 Queryと同様にGSI2SK昇順で返すよう明示する
          // （この後のJS側.sort()で降順に並べ替えるため、最終的な結果には影響しない）
          gsiSortKeyAttributeName: 'GSI2SK',
        },
        cursor ? { cursor } : undefined
      );
      items.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor !== undefined);

    return items
      .sort((a, b) => String(b.GSI2SK).localeCompare(String(a.GSI2SK)))
      .slice(0, limit)
      .map((item) => this.mapper.toSummary(item));
  }
}
