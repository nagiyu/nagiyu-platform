import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
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
  private readonly mapper: MessageMapper;
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
    this.mapper = new MessageMapper();
  }

  public async create(input: CreateMessageInput): Promise<MessageEntity> {
    const now = this.nowMs();
    const messageId = input.MessageID ?? this.ulidFactory(now);

    const entity: MessageEntity = {
      ...input,
      MessageID: messageId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const baseItem = this.mapper.toItem(entity);
    const item: DynamoDBItem & { TTL: number } = {
      ...baseItem,
      TTL: Math.floor(now / 1000) + MESSAGE_TTL_SECONDS,
    };

    // 既存（同一 ULID）の場合は store 側が `EntityAlreadyExistsError` を投げる。
    // 呼び出し側でハンドリングする想定なのでここでは何もせず透過させる。
    this.store.put(item, { attributeNotExists: true });
    return entity;
  }

  public async getById(key: MessageKey): Promise<MessageEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async listSince(
    userId: string,
    characterId: string,
    sinceMs: number
  ): Promise<MessageEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildMessageSKPrefix(characterId);

    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );

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
    const { items } = this.store.query(
      {
        pk,
        sk: { operator: 'begins_with', value: prefix },
      },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    const descSorted = [...items].sort((a, b) => (a.SK < b.SK ? 1 : a.SK > b.SK ? -1 : 0));

    const collected: MessageEntity[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const raw of descSorted) {
      const entity = this.mapper.toEntity(raw);
      const cost = tokenCounter.countTokensForMessage(entity.Text);
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
