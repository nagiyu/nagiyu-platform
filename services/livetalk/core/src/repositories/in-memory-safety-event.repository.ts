import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateSafetyEventInput,
  SafetyEventEntity,
  SafetyEventKey,
} from '../entities/safety-event.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
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

    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async getById(key: SafetyEventKey): Promise<SafetyEventEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }
}
