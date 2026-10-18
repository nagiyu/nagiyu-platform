import { EntityNotFoundError, InMemorySingleTableStore, OptimisticLockError } from '@nagiyu/aws';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';

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
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    subject: 'コーヒー',
    canonicalSummary: 'コーヒーが好き',
    category: '飲み物',
    care: 3,
    embedding: [0.1, 0.2],
    ...overrides,
  });

  describe('putTopic', () => {
    it('新規作成できる（CreatedAt/UpdatedAt が nowMs で付与される）', async () => {
      const topic = await repo.putTopic(makeTopicInput());
      expect(topic.createdAt).toBe(baseNow);
      expect(topic.updatedAt).toBe(baseNow);
      expect(topic.care).toBe(3);
    });

    it('同一キーで expectedUpdatedAt 未指定の再作成は OptimisticLockError を投げる', async () => {
      await repo.putTopic(makeTopicInput());
      await expect(repo.putTopic(makeTopicInput())).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('正しい expectedUpdatedAt で更新でき、CreatedAt は維持される', async () => {
      const created = await repo.putTopic(makeTopicInput());
      now += 1000;
      const updated = await repo.putTopic(makeTopicInput({ care: 5 }), {
        expectedUpdatedAt: created.updatedAt,
      });
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBe(now);
      expect(updated.care).toBe(5);
    });

    it('誤った expectedUpdatedAt での更新は OptimisticLockError を投げる（競合検知）', async () => {
      await repo.putTopic(makeTopicInput());
      now += 1000;
      await expect(
        repo.putTopic(makeTopicInput({ care: 5 }), { expectedUpdatedAt: 999 })
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('expectedUpdatedAt を指定しても Topic が無ければ EntityNotFoundError を投げる', async () => {
      await expect(
        repo.putTopic(makeTopicInput(), { expectedUpdatedAt: baseNow })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
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
      expect(result?.subject).toBe('コーヒー');
    });
  });

  describe('getTopicBundle', () => {
    it('META + SELF 全部 + WEB 全部を Type で振り分けて返す', async () => {
      await repo.putTopic(makeTopicInput());
      await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'ユーザーはコーヒーが好き',
        provenance: 'MSG-1',
      });
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: '新作コーヒーが発売された',
        sourceUrls: ['https://example.com'],
        volatility: 'medium',
        observedAt: now,
      });

      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });

      expect(bundle.topic?.subject).toBe('コーヒー');
      expect(bundle.selfFacts).toHaveLength(1);
      expect(bundle.selfFacts[0].text).toBe('ユーザーはコーヒーが好き');
      expect(bundle.webFacts).toHaveLength(1);
      expect(bundle.webFacts[0].text).toBe('新作コーヒーが発売された');
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
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-001' }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-002' }));
      await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-002',
        text: '別トピックの fact',
        provenance: '',
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
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-001' }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-002' }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-003', characterId: 'ageha' }));

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(2);
      expect(headers.map((h) => h.topicId).sort()).toEqual(['TOPIC-001', 'TOPIC-002']);
    });

    it('別ユーザーの Topic は含まない', async () => {
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-001', userId: 'u1' }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-002', userId: 'u2' }));

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      expect(headers[0].topicId).toBe('TOPIC-001');
    });

    it('SELF/WEB/CURSOR は列挙に含まれない（sparse GSI）', async () => {
      await repo.putTopic(makeTopicInput());
      await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact',
        provenance: '',
      });

      const headers = await repo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
    });

    it('care 降順で取得し limit を尊重する', async () => {
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-LOW', care: 1 }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-HIGH', care: 9 }));
      await repo.putTopic(makeTopicInput({ topicId: 'TOPIC-MID', care: 5 }));

      const result = await repo.listTopicHeadersByCareDesc('u1', 'hiyori', 2);
      expect(result).toHaveLength(2);
      expect(result[0].topicId).toBe('TOPIC-HIGH');
      expect(result[1].topicId).toBe('TOPIC-MID');
    });
  });

  describe('SELF fact', () => {
    it('putSelfFact は factId 未指定なら ULID を採番する', async () => {
      const fact = await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact text',
        provenance: 'MSG-1',
      });
      expect(fact.factId).toBe('ULID-0');
      expect(fact.createdAt).toBe(baseNow);
    });

    it('putSelfFact は明示 factId を尊重する', async () => {
      const fact = await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact text',
        provenance: '',
        factId: 'custom-fact',
      });
      expect(fact.factId).toBe('custom-fact');
    });

    it('listSelfFacts は Topic 配下の SELF fact を全件返す', async () => {
      await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact1',
        provenance: '',
      });
      await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact2',
        provenance: '',
      });

      const facts = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(2);
    });

    it('deleteSelfFact は対象が無ければ EntityNotFoundError を投げる', async () => {
      await expect(
        repo.deleteSelfFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-001',
          factId: 'missing',
        })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('deleteSelfFact は fact を削除する', async () => {
      const fact = await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact',
        provenance: '',
      });

      await repo.deleteSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        factId: fact.factId,
      });

      const facts = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(0);
    });
  });

  describe('WEB fact', () => {
    it('putWebFact は factId 未指定なら ULID を採番する', async () => {
      const fact = await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact',
        sourceUrls: ['https://example.com'],
        volatility: 'high',
        observedAt: baseNow,
      });
      expect(fact.factId).toBe('ULID-0');
    });

    it('listWebFacts は Topic 配下の WEB fact を全件返す', async () => {
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact1',
        sourceUrls: [],
        volatility: 'stable',
        observedAt: baseNow,
      });
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact2',
        sourceUrls: [],
        volatility: 'low',
        observedAt: baseNow,
      });

      const facts = await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts).toHaveLength(2);
    });
  });

  describe('listStaleWebFacts（GSI4/GSI-STALE 相当の窓走査）', () => {
    it('nextReview<=now の揮発 fact のみを昇順（古い順）で返す', async () => {
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: '新しめの期限切れ',
        sourceUrls: [],
        volatility: 'high',
        observedAt: baseNow,
        nextReview: baseNow - 1000,
      });
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: '古い期限切れ（先に処理すべき）',
        sourceUrls: [],
        volatility: 'low',
        observedAt: baseNow,
        nextReview: baseNow - 10_000,
      });
      // stable（NextReview なし）は掃引対象外
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: '安定 fact',
        sourceUrls: [],
        volatility: 'stable',
        observedAt: baseNow,
      });
      // 未来の NextReview は対象外
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'まだ期限が来ていない',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: baseNow,
        nextReview: baseNow + 10_000,
      });

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(2);
      expect(stale[0].text).toBe('古い期限切れ（先に処理すべき）');
      expect(stale[1].text).toBe('新しめの期限切れ');
    });

    it('limit を尊重する', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.putWebFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-001',
          text: `fact-${i}`,
          sourceUrls: [],
          volatility: 'high',
          observedAt: baseNow,
          nextReview: baseNow - i * 1000,
        });
      }

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 2);
      expect(stale).toHaveLength(2);
    });

    it('別ユーザー・別キャラの fact は含まない', async () => {
      await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'u1 fact',
        sourceUrls: [],
        volatility: 'high',
        observedAt: baseNow,
        nextReview: baseNow - 1000,
      });
      await repo.putWebFact({
        userId: 'u2',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'u2 fact',
        sourceUrls: [],
        volatility: 'high',
        observedAt: baseNow,
        nextReview: baseNow - 1000,
      });

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(1);
      expect(stale[0].text).toBe('u1 fact');
    });
  });

  describe('updateWebFactNextReview', () => {
    it('既存 WEB fact の nextReview を前方更新する', async () => {
      const fact = await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact',
        sourceUrls: [],
        volatility: 'high',
        observedAt: baseNow,
        nextReview: baseNow,
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: fact.factId },
        baseNow + 100_000
      );

      const facts = await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');
      expect(facts[0].nextReview).toBe(baseNow + 100_000);
    });

    it('更新後は掃引窓（listStaleWebFacts）から外れる', async () => {
      const fact = await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact',
        sourceUrls: [],
        volatility: 'high',
        observedAt: baseNow,
        nextReview: baseNow - 1000,
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: fact.factId },
        baseNow + 100_000
      );

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale).toHaveLength(0);
    });

    it('NextReview を持たない fact に設定すると掃引窓に載る', async () => {
      const fact = await repo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact',
        sourceUrls: [],
        volatility: 'low',
        observedAt: baseNow,
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: fact.factId },
        baseNow - 1
      );

      const stale = await repo.listStaleWebFacts('u1', 'hiyori', baseNow, 10);
      expect(stale.map((f) => f.factId)).toEqual([fact.factId]);
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
