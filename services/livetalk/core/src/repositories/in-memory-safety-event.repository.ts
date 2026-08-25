import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
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
  private readonly mapper: SafetyEventMapper;
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
    this.mapper = new SafetyEventMapper();
  }

  public async create(input: CreateSafetyEventInput): Promise<SafetyEventEntity> {
    const now = this.nowMs();
    const eventId = input.EventID ?? this.ulidFactory(now);

    const entity: SafetyEventEntity = {
      ...input,
      EventID: eventId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    // 実DynamoDB実装（dynamodb-safety-event.repository.ts）は
    // ConditionExpression: 'attribute_not_exists(PK)' で重複作成を防ぎ、
    // ConditionalCheckFailedException を EntityAlreadyExistsError に変換して投げる。
    // InMemory側もキー重複時に同じ name のエラーを投げるよう、
    // attributeNotExists 条件付きで put する（stock-tracker の
    // InMemoryHoldingRepository.create と同じ流儀：ストアが投げるエラーをそのまま伝播する）。
    this.store.put(this.mapper.toItem(entity), { attributeNotExists: true });
    return entity;
  }

  public async getById(key: SafetyEventKey): Promise<SafetyEventEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async listRecent(limit: number): Promise<SafetyEventSummary[]> {
    // GSI2PK='SAFETY' のアイテムを全件取得してから GSI2SK（EventID / ULID）の降順でソートし、
    // limit 件返す。queryByAttribute は既定 limit=100 でページングするため、cursor ループで
    // 全件集約しないと「最近の検出」を取り落とす（in-memory-profile.repository の listAllUserIds と同パターン）。
    const items: DynamoDBItem[] = [];
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
