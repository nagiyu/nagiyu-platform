import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { OptimisticLockError } from '../../../src/repositories/optimistic-lock.error.js';

describe('InMemoryTopicRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryTopicRepository;
  let ulidCounter = 0;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    ulidCounter = 0;
    repo = new InMemoryTopicRepository(
      store,
      () => `ULID-${ulidCounter++}`,
      () => now
    );
  });

  const makeTopicInput = (overrides: Partial<Record<string, unknown>> = {}) => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    Subject: 'コーヒー',
    CanonicalSummary: 'コーヒーが好き',
    Category: '飲み物',
    Care: 3,
    Embedding: [0.1, 0.2],
    ...overrides,
  });

  describe('putTopic', () => {
    it('新規作成できる（CreatedAt/UpdatedAt が nowMs で付与される）', async () => {
      const topic = await repo.putTopic(makeTopicInput());
      expect(topic.CreatedAt).toBe(baseNow);
      expect(topic.UpdatedAt).toBe(baseNow);
      expect(topic.Care).toBe(3);
    });

    it('同一キーで expectedUpdatedAt 未指定の再作成は OptimisticLockError を投げる', async () => {
      await repo.putTopic(makeTopicInput());
      await expect(repo.putTopic(makeTopicInput())).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('正しい expectedUpdatedAt で更新でき、CreatedAt は維持される', async () => {
      const created = await repo.putTopic(makeTopicInput());
      now += 1000;
      const updated = await repo.putTopic(makeTopicInput({ Care: 5 }), {
        expectedUpdatedAt: created.UpdatedAt,
      });
      expect(updated.CreatedAt).toBe(created.CreatedAt);
      expect(updated.UpdatedAt).toBe(now);
      expect(updated.Care).toBe(5);
    });

    it('誤った expectedUpdatedAt での更新は OptimisticLockError を投げる（競合検知）', async () => {
      await repo.putTopic(makeTopicInput());
      now += 1000;
      await expect(
        repo.putTopic(makeTopicInput({ Care: 5 }), { expectedUpdatedAt: 999 })
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('error.name で競合を判別できる', async () => {
      await repo.putTopic(makeTopicInput());
      await expect(repo.putTopic(makeTopicInput())).rejects.toMatchObject({
        name: 'OptimisticLockError',
      });
    });
  });

  describe('getTopic', () => {
    it('存在しない Topic は null を返す', async () => {
      const result = await repo.getTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'missing',
      });
      expect(result).toBeNull();
    });

    it('保存した Topic を取得できる', async () => {
      await repo.putTopic(makeTopicInput());
      const result = await repo.getTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(result?.Subject).toBe('コーヒー');
    });
  });

  describe('getTopicBundle', () => {
    it('META + SELF 全部 + WEB 全部を Type で振り分けて返す', async () => {
      await repo.putTopic(makeTopicInput());
      await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'ユーザーはコーヒーが好き',
        Provenance: 'MSG-1',
      });
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: '新作コーヒーが発売された',
        SourceUrls: ['https://example.com'],
        Volatility: 'medium',
        ObservedAt: now,
      });

      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });

      expect(bundle.topic?.Subject).toBe('コーヒー');
      expect(bundle.selfFacts).toHaveLength(1);
      expect(bundle.selfFacts[0].Text).toBe('ユーザーはコーヒーが好き');
      expect(bundle.webFacts).toHaveLength(1);
      expect(bundle.webFacts[0].Text).toBe('新作コーヒーが発売された');
    });

    it('Topic が存在しない場合 topic は null になる', async () => {
      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'missing',
      });
      expect(bundle.topic).toBeNull();
      expect(bundle.selfFacts).toEqual([]);
      expect(bundle.webFacts).toEqual([]);
    });

    it('他 Topic の SELF/WEB は含まない（SK プレフィックスで分離）', async () => {
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-001' }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-002' }));
      await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-002',
        Text: '別トピックの fact',
        Provenance: '',
      });

      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(bundle.selfFacts).toHaveLength(0);
    });
  });

  describe('listTopicHeaders / listTopicHeadersByCareDesc（GSI3 相当）', () => {
    it('キャラ単位の Topic ヘッダを全件列挙する', async () => {
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-001' }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-002' }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-003', CharacterID: 'ageha' }));

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(2);
      expect(headers.map((h) => h.TopicID).sort()).toEqual(['TOPIC-001', 'TOPIC-002']);
    });

    it('別ユーザーの Topic は含まない', async () => {
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-001', UserID: 'u1' }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-002', UserID: 'u2' }));

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      expect(headers[0].TopicID).toBe('TOPIC-001');
    });

    it('SELF/WEB/CURSOR は列挙に含まれない（sparse GSI）', async () => {
      await repo.putTopic(makeTopicInput());
      await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact',
        Provenance: '',
      });

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
    });

    it('care 降順で取得し limit を尊重する', async () => {
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-LOW', Care: 1 }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-HIGH', Care: 9 }));
      await repo.putTopic(makeTopicInput({ TopicID: 'TOPIC-MID', Care: 5 }));

      const result = await repo.listTopicHeadersByCareDesc('u1', 'hiyori', 2);
      expect(result).toHaveLength(2);
      expect(result[0].TopicID).toBe('TOPIC-HIGH');
      expect(result[1].TopicID).toBe('TOPIC-MID');
    });
  });

  describe('SELF fact', () => {
    it('putSelfFact は FactID 未指定なら ULID を採番する', async () => {
      const fact = await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact text',
        Provenance: 'MSG-1',
      });
      expect(fact.FactID).toBe('ULID-0');
      expect(fact.CreatedAt).toBe(baseNow);
    });

    it('putSelfFact は明示 FactID を尊重する', async () => {
      const fact = await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact text',
        Provenance: '',
        FactID: 'custom-fact',
      });
      expect(fact.FactID).toBe('custom-fact');
    });

    it('listSelfFacts は Topic 配下の SELF fact を全件返す', async () => {
      await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact1',
        Provenance: '',
      });
      await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact2',
        Provenance: '',
      });

      const facts = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(2);
    });

    it('deleteSelfFact は fact を削除する（P2 忘却用）', async () => {
      const fact = await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact',
        Provenance: '',
      });

      await repo.deleteSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        factId: fact.FactID,
      });

      const facts = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(0);
    });
  });

  describe('WEB fact', () => {
    it('putWebFact は FactID 未指定なら ULID を採番する', async () => {
      const fact = await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact',
        SourceUrls: ['https://example.com'],
        Volatility: 'high',
        ObservedAt: baseNow,
      });
      expect(fact.FactID).toBe('ULID-0');
    });

    it('listWebFacts は Topic 配下の WEB fact を全件返す', async () => {
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact1',
        SourceUrls: [],
        Volatility: 'stable',
        ObservedAt: baseNow,
      });
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact2',
        SourceUrls: [],
        Volatility: 'low',
        ObservedAt: baseNow,
      });

      const facts = await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(2);
    });
  });

  describe('listStaleWebFacts（GSI4/GSI-STALE 相当の窓走査）', () => {
    it('nextReview<=now の揮発 fact のみを昇順（古い順）で返す', async () => {
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: '新しめの期限切れ',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: baseNow,
        NextReview: baseNow - 1000,
      });
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: '古い期限切れ（先に処理すべき）',
        SourceUrls: [],
        Volatility: 'low',
        ObservedAt: baseNow,
        NextReview: baseNow - 10_000,
      });
      // stable（NextReview なし）は掃引対象外
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: '安定 fact',
        SourceUrls: [],
        Volatility: 'stable',
        ObservedAt: baseNow,
      });
      // 未来の NextReview は対象外
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'まだ期限が来ていない',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: baseNow,
        NextReview: baseNow + 10_000,
      });

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(2);
      expect(stale[0].Text).toBe('古い期限切れ（先に処理すべき）');
      expect(stale[1].Text).toBe('新しめの期限切れ');
    });

    it('limit を尊重する', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.putWebFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'TOPIC-001',
          Text: `fact-${i}`,
          SourceUrls: [],
          Volatility: 'high',
          ObservedAt: baseNow,
          NextReview: baseNow - i * 1000,
        });
      }

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 2);
      expect(stale).toHaveLength(2);
    });

    it('別ユーザー・別キャラの fact は含まない', async () => {
      await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'u1 fact',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: baseNow,
        NextReview: baseNow - 1000,
      });
      await repo.putWebFact({
        UserID: 'u2',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'u2 fact',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: baseNow,
        NextReview: baseNow - 1000,
      });

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(1);
      expect(stale[0].Text).toBe('u1 fact');
    });
  });

  describe('updateWebFactNextReview', () => {
    it('既存 WEB fact の NextReview を前方更新する', async () => {
      const fact = await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: baseNow,
        NextReview: baseNow,
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: fact.FactID },
        baseNow + 100_000
      );

      const facts = await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts[0].NextReview).toBe(baseNow + 100_000);
    });

    it('更新後は掃引窓（listStaleWebFacts）から外れる', async () => {
      const fact = await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: baseNow,
        NextReview: baseNow - 1000,
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: fact.FactID },
        baseNow + 100_000
      );

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(0);
    });

    it('存在しない fact は no-op（例外を投げない）', async () => {
      await expect(
        repo.updateWebFactNextReview(
          { userId: 'u1', characterId: 'hiyori', topicId: 'missing', factId: 'missing' },
          baseNow + 1000
        )
      ).resolves.toBeUndefined();
    });
  });
});
