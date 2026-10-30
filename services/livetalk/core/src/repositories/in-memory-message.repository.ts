import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import { MESSAGE_TTL_SECONDS } from '../constants.js';
import type { CreateMessageInput, MessageEntity, MessageKey } from '../entities/message.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { getDefaultTokenCounter, resolveContextTokenLimit } from '../lib/token-counter.js';
import { MessageMapper } from '../mappers/message.mapper.js';
import { buildMessageSKPrefix, buildUserPK } from '../mappers/keys.js';
import type {
  GetRecentByTokenBudgetOptions,
  MessageRepository,
  RecentMessagesResult,
} from './message.repository.interface.js';

const DEFAULT_HARD_LIMIT = 500;

export class InMemoryMessageRepository implements MessageRepository {
  private readonly mapper = new MessageMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<MessageEntity, MessageKey>;

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

  public async create(input: CreateMessageInput): Promise<MessageEntity> {
    const now = this.nowMs();
    return this.entityStore.create({
      ...input,
      messageId: input.messageId ?? this.ulidFactory(now),
      createdAt: now,
      updatedAt: now,
      expiresAt: now + MESSAGE_TTL_SECONDS * 1000,
    });
  }

  public async getById(key: MessageKey): Promise<MessageEntity | null> {
    return this.entityStore.get(key);
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<MessageEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildMessageSKPrefix(characterId);

    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });

    const filtered = sinceMs > 0 ? items.filter((i) => (i.CreatedAt as number) > sinceMs) : items;
    const sorted = [...filtered].sort((a, b) => (a.SK < b.SK ? -1 : a.SK > b.SK ? 1 : 0));
    return sorted.map((i) => this.mapper.toEntity(i));
  }

  public async getRecentByTokenBudget(
    options: GetRecentByTokenBudgetOptions
  ): Promise<RecentMessagesResult> {
    const tokenLimit = resolveContextTokenLimit(options.tokenLimit);
    const tokenCounter = options.tokenCounter ?? getDefaultTokenCounter();
    const hardLimit = options.hardLimit ?? DEFAULT_HARD_LIMIT;

    const pk = buildUserPK(options.userId);
    const prefix = buildMessageSKPrefix(options.characterId);

    // InMemorySingleTableStore.query は SK 昇順しか返さないので、自分で降順に並べ替える。
    const items = this.store.queryAll({
      pk,
      sk: { operator: 'begins_with', value: prefix },
    });
    const descSorted = [...items].sort((a, b) => (a.SK < b.SK ? 1 : a.SK > b.SK ? -1 : 0));

    const collected: MessageEntity[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const raw of descSorted) {
      const entity = this.mapper.toEntity(raw);
      const cost = tokenCounter.countTokensForMessage(entity.text);
      if (collected.length > 0 && totalTokens + cost > tokenLimit) {
        truncated = true;
        break;
      }
      collected.push(entity);
      totalTokens += cost;
      if (collected.length >= hardLimit) {
        truncated = true;
        break;
      }
    }

    collected.reverse();
    return { messages: collected, totalTokens, truncated };
  }
}
