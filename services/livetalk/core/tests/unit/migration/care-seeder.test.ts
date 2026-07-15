import { InMemorySingleTableStore } from '@nagiyu/aws';
import { computeCareBoosts, applyCareBoosts } from '../../../src/migration/care-seeder.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';
import type {
  LegacyInterestCategoryEntity,
  LegacyMemoryEntity,
} from '../../../src/migration/legacy-types.js';

const USER_ID = 'u1';
const CHARACTER_ID = 'hiyori';
const FIXED_NOW = 1_700_000_000_000;

function makeTopic(overrides: Partial<TopicEntity> = {}): TopicEntity {
  return {
    UserID: USER_ID,
    CharacterID: CHARACTER_ID,
    TopicID: 'TOPIC-1',
    Subject: 'コーヒー',
    CanonicalSummary: '要約',
    Category: '趣味',
    Care: 1,
    Embedding: [1, 0],
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
    ...overrides,
  };
}

describe('computeCareBoosts', () => {
  it('cosine 最大の Topic に正規化済み重みを割り当てて丸め・上限 cap する', () => {
    const topics = [makeTopic({ TopicID: 'T1', Embedding: [1, 0], Category: '趣味' })];
    const interests: LegacyInterestCategoryEntity[] = [
      { Category: '趣味', Weight: 10, Embedding: [1, 0] },
    ];
    const memories: LegacyMemoryEntity[] = [
      { Content: 'x', Category: '趣味', Embedding: [1, 0], ReferencedCount: 5 },
    ];

    const boosts = computeCareBoosts(topics, interests, memories);

    // interests は 1 件のみなので正規化後 weight=1、memories も 1 件のみで正規化後 weight=1
    // 合計 2 → round(2) = 2（上限 5 以下なのでそのまま）
    expect(boosts.get('T1')).toBe(2);
  });

  it('最大 weight が 0 以下の集合はスキップする', () => {
    const topics = [makeTopic({ TopicID: 'T1' })];
    const interests: LegacyInterestCategoryEntity[] = [
      { Category: '趣味', Weight: 0, Embedding: [1, 0] },
    ];
    const boosts = computeCareBoosts(topics, interests, []);
    expect(boosts.size).toBe(0);
  });

  it('cosine が閾値未満なら Category 文字列一致でフォールバックする', () => {
    const topics = [
      makeTopic({ TopicID: 'T-COSINE', Embedding: [1, 0], Category: '別カテゴリ' }),
      makeTopic({ TopicID: 'T-CATEGORY', Embedding: [0, 1, 0], Category: '趣味' }),
    ];
    // シグナルの embedding は次元が異なりどの Topic とも cosine=0（次元不一致は 0 を返す）
    const interests: LegacyInterestCategoryEntity[] = [
      { Category: '趣味', Weight: 1, Embedding: [0, 0, 1, 0] },
    ];

    const boosts = computeCareBoosts(topics, interests, []);
    expect(boosts.get('T-CATEGORY')).toBe(1);
    expect(boosts.has('T-COSINE')).toBe(false);
  });

  it('embedding 欠損シグナルは Category 一致のみで割り当てる', () => {
    const topics = [makeTopic({ TopicID: 'T1', Embedding: [1, 0], Category: '趣味' })];
    const memories: LegacyMemoryEntity[] = [
      { Content: 'x', Category: '趣味', Embedding: [], ReferencedCount: 4 },
    ];
    const boosts = computeCareBoosts(topics, [], memories);
    expect(boosts.get('T1')).toBe(1);
  });

  it('割り当て先が無いシグナルは drop する（例外にならない）', () => {
    const topics = [makeTopic({ TopicID: 'T1', Embedding: [1, 0], Category: '趣味' })];
    const memories: LegacyMemoryEntity[] = [
      { Content: 'x', Category: '無関係カテゴリ', Embedding: [], ReferencedCount: 4 },
    ];
    const boosts = computeCareBoosts(topics, [], memories);
    expect(boosts.size).toBe(0);
  });

  it('Topic が 0 件のときは常に drop する', () => {
    const memories: LegacyMemoryEntity[] = [
      { Content: 'x', Category: '趣味', Embedding: [1, 0], ReferencedCount: 4 },
    ];
    const boosts = computeCareBoosts([], [], memories);
    expect(boosts.size).toBe(0);
  });

  it('合計が MIGRATION_CARE_SEED_MAX_PER_TOPIC を超える場合は上限で cap する', () => {
    const topics = [makeTopic({ TopicID: 'T1', Embedding: [1, 0], Category: '趣味' })];
    const interests: LegacyInterestCategoryEntity[] = Array.from({ length: 3 }, (_, i) => ({
      Category: '趣味',
      Weight: i === 0 ? 100 : 100 - i,
      Embedding: [1, 0],
    }));
    const boosts = computeCareBoosts(topics, interests, []);
    expect(boosts.get('T1')).toBeLessThanOrEqual(5);
  });
});

describe('applyCareBoosts', () => {
  it('Topic の Care に boost を加算して putTopic する', async () => {
    const store = new InMemorySingleTableStore();
    const topicRepo = new InMemoryTopicRepository(
      store,
      () => 'X',
      () => FIXED_NOW
    );
    const topic = await topicRepo.putTopic({
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      TopicID: 'T1',
      Subject: 'コーヒー',
      CanonicalSummary: '要約',
      Category: '趣味',
      Care: 1,
      Embedding: [1, 0],
    });

    const boosts = new Map([['T1', 3]]);
    const result = await applyCareBoosts(topicRepo, USER_ID, CHARACTER_ID, [topic], boosts);

    expect(result).toEqual({ appliedCount: 1, skippedCount: 0 });
    const updated = await topicRepo.getTopic({
      userId: USER_ID,
      characterId: CHARACTER_ID,
      topicId: 'T1',
    });
    expect(updated?.Care).toBe(4);
  });

  it('boosts に含まれるが topics 一覧に無い TopicID はスキップする', async () => {
    const store = new InMemorySingleTableStore();
    const topicRepo = new InMemoryTopicRepository(store);
    const boosts = new Map([['MISSING', 2]]);
    const result = await applyCareBoosts(topicRepo, USER_ID, CHARACTER_ID, [], boosts);
    expect(result).toEqual({ appliedCount: 0, skippedCount: 1 });
  });

  it('OptimisticLockError は warn してスキップし、他への適用は継続する', async () => {
    const store = new InMemorySingleTableStore();
    const topicRepo = new InMemoryTopicRepository(
      store,
      () => 'X',
      () => FIXED_NOW
    );
    const topic1 = await topicRepo.putTopic({
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      TopicID: 'T1',
      Subject: 'A',
      CanonicalSummary: '',
      Category: '趣味',
      Care: 1,
      Embedding: [1, 0],
    });
    const topic2 = await topicRepo.putTopic({
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      TopicID: 'T2',
      Subject: 'B',
      CanonicalSummary: '',
      Category: '趣味',
      Care: 1,
      Embedding: [1, 0],
    });

    // T1 の UpdatedAt を古いまま渡すことで OptimisticLockError を誘発させる
    const staleTopic1: typeof topic1 = { ...topic1, UpdatedAt: topic1.UpdatedAt - 1 };

    const boosts = new Map([
      ['T1', 2],
      ['T2', 1],
    ]);
    const result = await applyCareBoosts(
      topicRepo,
      USER_ID,
      CHARACTER_ID,
      [staleTopic1, topic2],
      boosts
    );

    expect(result).toEqual({ appliedCount: 1, skippedCount: 1 });
    const updatedTopic2 = await topicRepo.getTopic({
      userId: USER_ID,
      characterId: CHARACTER_ID,
      topicId: 'T2',
    });
    expect(updatedTopic2?.Care).toBe(2);
  });
});
