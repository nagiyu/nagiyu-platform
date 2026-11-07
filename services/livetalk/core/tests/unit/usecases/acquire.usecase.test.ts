import { EntityNotFoundError, InMemorySingleTableStore } from '@nagiyu/aws';
import {
  acquireForUser,
  shouldAcquireNow,
  buildLatestInfoQuery,
} from '../../../src/usecases/acquire.usecase.js';
import { InMemoryStudyUsageRepository } from '../../../src/repositories/in-memory-study-usage.repository.js';
import { createDailyResearchAllowance } from '../../../src/study/research-allowance.js';
import type { ResearchAllowance } from '../../../src/study/research-allowance.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';
import { InMemoryFreshnessCheckRequestRepository } from '../../../src/repositories/in-memory-freshness-check-request.repository.js';
import { InMemoryStudyTopicRepository } from '../../../src/repositories/in-memory-study-topic.repository.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';
import type { IResearchClient, ResearchResult } from '../../../src/research/types.js';
import type { IWebFactChangeDetector } from '../../../src/research/web-fact-change-detector.js';
import { ACQUIRE_MAX_QUERIES_PER_RUN, WEBFACT_REVIEW_INTERVAL_MS } from '../../../src/constants.js';

const makeLifecycle = (overrides: Partial<LifecycleEntity> = {}): LifecycleEntity => ({
  userId: 'u1',
  characterId: 'hiyori',
  bedtime: '01:30',
  wakeUpTime: '09:30',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const character: CharacterDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  notificationName: 'ひより',
  personality: {
    basePrompt: '',
    speechStyle: '優しい口調',
    preferences: { likes: ['コーヒー'], dislikes: [] },
  },
  voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
  license: { displayText: '', creditName: '' },
};

const makeResearchResult = (overrides: Partial<ResearchResult> = {}): ResearchResult => ({
  topic: 'テストトピック',
  summary: 'テスト要約です。',
  sourceUrls: ['https://example.com'],
  rawComment: 'へぇ！',
  // 呼び出し 1 回あたり search 2 + open_page 1 の合計 3 回とする
  webSearchCalls: { total: 3, search: 2, openPage: 1, findInPage: 0, other: 0 },
  ...overrides,
});

function makeResearchClient(impl?: (query: string) => Promise<ResearchResult>): IResearchClient {
  return {
    research: jest.fn(impl ?? (async (query: string) => makeResearchResult({ topic: query }))),
  };
}

function makeChangeDetector(defaultResult = true): IWebFactChangeDetector {
  return {
    hasChanged: jest.fn(async () => defaultResult),
  };
}

describe('shouldAcquireNow', () => {
  // 14:00 ローカル時刻（起床中・非ピーク）
  const awakeNonPeak = new Date(2026, 5, 1, 14, 0, 0);
  // 03:00 ローカル時刻（就寝中）
  const sleeping = new Date(2026, 4, 31, 3, 0, 0);

  it('起床中かつ非ピーク時間は awake=true, skipSelfStudy=false', () => {
    const result = shouldAcquireNow(makeLifecycle(), awakeNonPeak);
    expect(result.awake).toBe(true);
    expect(result.skipSelfStudy).toBe(false);
  });

  it('就寝中は awake=false', () => {
    const result = shouldAcquireNow(makeLifecycle(), sleeping);
    expect(result.awake).toBe(false);
    expect(result.reason).toContain('就寝中');
  });

  it('ピーク活動時間帯は awake=true だが skipSelfStudy=true', () => {
    const lifecycle = makeLifecycle({
      userActivityProfile: {
        morningPeak: '14:00',
        eveningPeak: '21:00',
        sampleSize: 10,
        lastLearnedAt: '2026-06-01T00:00:00Z',
      },
    });
    const result = shouldAcquireNow(lifecycle, awakeNonPeak);
    expect(result.awake).toBe(true);
    expect(result.skipSelfStudy).toBe(true);
  });
});

describe('buildLatestInfoQuery', () => {
  it('末尾が「最新情報」でなければ付け足す', () => {
    expect(buildLatestInfoQuery('桜まつり')).toBe('桜まつり 最新情報');
  });

  it('末尾が既に「最新情報」なら二重付与しない', () => {
    expect(buildLatestInfoQuery('芸能人の最新情報')).toBe('芸能人の最新情報');
  });

  it('前後の空白を trim した上で末尾判定する', () => {
    expect(buildLatestInfoQuery('  芸能人の最新情報  ')).toBe('芸能人の最新情報');
    expect(buildLatestInfoQuery('  桜まつり  ')).toBe('桜まつり 最新情報');
  });
});

describe('acquireForUser', () => {
  const awakeNonPeak = new Date(2026, 5, 1, 14, 0, 0);
  const NOW_MS = awakeNonPeak.getTime();

  let topicRepo: InMemoryTopicRepository;
  let webRawRepo: InMemoryWebRawRepository;
  let studyTopicRepo: InMemoryStudyTopicRepository;
  let freshnessCheckRequestRepo: InMemoryFreshnessCheckRequestRepository;
  /** 上限なしの枠。上限の挙動を見ないケースで使う */
  const researchAllowance: ResearchAllowance = { tryConsume: async () => true };

  beforeEach(() => {
    const topicStore = new InMemorySingleTableStore();
    topicRepo = new InMemoryTopicRepository(
      topicStore,
      () => 'ulid-topic',
      () => NOW_MS
    );
    const webRawStore = new InMemorySingleTableStore();
    webRawRepo = new InMemoryWebRawRepository(
      webRawStore,
      () => 'ulid-webraw',
      () => NOW_MS
    );
    const studyTopicStore = new InMemorySingleTableStore();
    studyTopicRepo = new InMemoryStudyTopicRepository(studyTopicStore, () => NOW_MS);
    freshnessCheckRequestRepo = new InMemoryFreshnessCheckRequestRepository(
      new InMemorySingleTableStore(),
      () => NOW_MS
    );
  });

  it('就寝中は全スキップする', async () => {
    const sleeping = new Date(2026, 4, 31, 3, 0, 0);
    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => sleeping,
    });

    expect(result.outcome).toBe('skipped');
    expect(researchClient.research).not.toHaveBeenCalled();
  });

  describe('1 日の上限', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    let studyUsageRepo: InMemoryStudyUsageRepository;
    let clockMs = NOW_MS;

    const allowanceFor = (limit: number): ResearchAllowance =>
      createDailyResearchAllowance({
        studyUsageRepo,
        userId: 'u1',
        characterId: 'hiyori',
        limit,
        now: () => new Date(clockMs),
      });

    /** 依頼を count 件 pending で積む */
    async function seedRequests(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await studyTopicRepo.put({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: `req-${i}`,
          topic: `依頼${i}`,
          priority: 10,
          status: 'pending',
        });
      }
    }

    async function run(allowance: ResearchAllowance, researchClient = makeResearchClient()) {
      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        studyTopicRepo,
        researchClient,
        changeDetector: makeChangeDetector(),
        character,
        lifecycle: makeLifecycle(),
        researchAllowance: allowance,
        now: () => awakeNonPeak,
        maxQueriesPerRun: 10,
      });
      return { result, researchClient };
    }

    beforeEach(() => {
      studyUsageRepo = new InMemoryStudyUsageRepository(new InMemorySingleTableStore());
      clockMs = NOW_MS;
    });

    it('上限ちょうど: 上限までリサーチし、止まったとは数えない', async () => {
      await seedRequests(3);
      const { result, researchClient } = await run(allowanceFor(3));

      expect(researchClient.research).toHaveBeenCalledTimes(3);
      expect(result.requestsProcessed).toBe(3);
      expect(result.dailyLimitReached).toBe(false);
    });

    it('上限を超えるとき: 上限までで止め、残りの依頼は pending のまま残す', async () => {
      await seedRequests(4);
      const { result, researchClient } = await run(allowanceFor(3));

      expect(researchClient.research).toHaveBeenCalledTimes(3);
      expect(result.requestsProcessed).toBe(3);
      expect(result.dailyLimitReached).toBe(true);
      expect(result.counterFailed).toBe(false);
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending')).toHaveLength(1);
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'in_progress')).toHaveLength(0);
    });

    it('上限に達したら鮮度切れ・自発リサーチも止める (3 種を同じ枠で数える)', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await seedRequests(1);
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 5,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        text: '開催は今週末',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 30 * DAY_MS,
        nextReview: NOW_MS - 1000,
      });

      const { result, researchClient } = await run(allowanceFor(1));

      expect(researchClient.research).toHaveBeenCalledTimes(1);
      expect(result.requestsProcessed).toBe(1);
      expect(result.staleRefreshed).toBe(0);
      expect(result.selfStudied).toBe(0);
      expect(result.dailyLimitReached).toBe(true);
    });

    it('3 種を合わせて上限を数える', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await seedRequests(1);
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 5,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        text: '開催は今週末',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 30 * DAY_MS,
        nextReview: NOW_MS - 1000,
      });

      const { result, researchClient } = await run(allowanceFor(2));

      // 依頼 1 + 鮮度切れ 1 で上限。自発リサーチには回らない
      expect(researchClient.research).toHaveBeenCalledTimes(2);
      expect(result.requestsProcessed).toBe(1);
      expect(result.staleRefreshed).toBe(1);
      expect(result.selfStudied).toBe(0);
      expect(result.dailyLimitReached).toBe(true);
    });

    it('枠が 0 のときは 1 回もリサーチしない', async () => {
      await seedRequests(1);
      const { result, researchClient } = await run(allowanceFor(0));

      expect(researchClient.research).not.toHaveBeenCalled();
      expect(result.dailyLimitReached).toBe(true);
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending')).toHaveLength(1);
    });

    it('リサーチが失敗しても数えた回数は戻さない', async () => {
      await seedRequests(2);
      const failing = makeResearchClient(async () => {
        throw new Error('検索失敗');
      });
      const first = await run(allowanceFor(2), failing);
      expect(first.result.requestsProcessed).toBe(0);

      // 2 回とも失敗しても 2 回分が数えられており、同じ日の次の実行では 1 回も使えない
      const second = await run(allowanceFor(2));
      expect(second.researchClient.research).not.toHaveBeenCalled();
      expect(second.result.dailyLimitReached).toBe(true);
    });

    it('リサーチが続けて失敗しても、1 回の実行では予算の 3 回までしか試さず、枠も 3 回分しか減らない', async () => {
      await seedRequests(5);
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 5,
        embedding: [0.1],
      });
      const failing = makeResearchClient(async () => {
        throw new Error('検索失敗');
      });
      const allowance = allowanceFor(20);
      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        studyTopicRepo,
        researchClient: failing,
        changeDetector: makeChangeDetector(),
        character,
        lifecycle: makeLifecycle(),
        researchAllowance: allowance,
        now: () => awakeNonPeak,
      });

      expect(result.outcome).toBe('acquired');
      expect(failing.research).toHaveBeenCalledTimes(ACQUIRE_MAX_QUERIES_PER_RUN);
      // 失敗した依頼は pending に戻る
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending')).toHaveLength(5);
      // 枠は 3 回分だけ減っている (残り 17 回)
      let remaining = 0;
      while (await allowance.tryConsume()) remaining++;
      expect(remaining).toBe(20 - ACQUIRE_MAX_QUERIES_PER_RUN);
    });

    it('自発リサーチが続けて失敗しても予算の 3 回までしか試さない', async () => {
      for (let i = 0; i < 5; i++) {
        await topicRepo.putTopic({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: `topic-${i}`,
          subject: `話題${i}`,
          canonicalSummary: '要約',
          category: 'その他',
          care: 5 - i,
          embedding: [0.1],
        });
      }
      const second = makeResearchClient(async () => {
        throw new Error('検索失敗');
      });
      await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        studyTopicRepo,
        researchClient: second,
        changeDetector: makeChangeDetector(),
        character,
        lifecycle: makeLifecycle(),
        researchAllowance: allowanceFor(20),
        now: () => awakeNonPeak,
      });

      expect(second.research).toHaveBeenCalledTimes(ACQUIRE_MAX_QUERIES_PER_RUN);
    });

    it('依頼が削除されていてリサーチを呼ばずにスキップしたときは、枠を数えない', async () => {
      await seedRequests(1);
      jest
        .spyOn(studyTopicRepo, 'updateStatus')
        .mockRejectedValueOnce(new EntityNotFoundError('StudyTopic', 'req-0'));
      const allowance = allowanceFor(1);
      const { researchClient } = await run(allowance);

      expect(researchClient.research).not.toHaveBeenCalled();
      expect(await allowance.tryConsume()).toBe(true);
    });

    it('枠が使えず止めた依頼は pending に戻る', async () => {
      await seedRequests(1);
      await run(allowanceFor(0));

      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending')).toHaveLength(1);
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'in_progress')).toHaveLength(0);
    });

    it('日付が変わると枠が戻る', async () => {
      await seedRequests(2);
      const first = await run(allowanceFor(1));
      expect(first.result.requestsProcessed).toBe(1);
      expect(first.result.dailyLimitReached).toBe(true);

      const sameDay = await run(allowanceFor(1));
      expect(sameDay.researchClient.research).not.toHaveBeenCalled();

      clockMs = NOW_MS + DAY_MS;
      const nextDay = await run(allowanceFor(1));
      expect(nextDay.result.requestsProcessed).toBe(1);
    });

    it('日本時間の 0 時で日が変わる', async () => {
      await seedRequests(2);
      // 2026-06-01 23:59:59 JST と 2026-06-02 00:00:00 JST
      clockMs = Date.parse('2026-06-01T14:59:59Z');
      expect((await run(allowanceFor(1))).result.requestsProcessed).toBe(1);
      clockMs = Date.parse('2026-06-01T15:00:00Z');
      expect((await run(allowanceFor(1))).result.requestsProcessed).toBe(1);
    });

    it('カウンターの障害: 勉強を止め、依頼は pending のまま残す', async () => {
      await seedRequests(2);
      const broken: ResearchAllowance = {
        tryConsume: async () => {
          throw new Error('DynamoDB 障害');
        },
      };
      const { result, researchClient } = await run(broken);

      expect(researchClient.research).not.toHaveBeenCalled();
      expect(result.counterFailed).toBe(true);
      expect(result.dailyLimitReached).toBe(false);
      expect(await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending')).toHaveLength(2);
    });

    it('カウンターが障害になった時点で残りも止める', async () => {
      await seedRequests(3);
      let calls = 0;
      const flaky: ResearchAllowance = {
        tryConsume: async () => {
          calls++;
          if (calls > 1) throw new Error('DynamoDB 障害');
          return true;
        },
      };
      const { result, researchClient } = await run(flaky);

      expect(researchClient.research).toHaveBeenCalledTimes(1);
      expect(calls).toBe(2);
      expect(result.requestsProcessed).toBe(1);
      expect(result.counterFailed).toBe(true);
    });

    it('利用者・キャラクターごとに別の枠として数える', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await seedRequests(2);
      const other = createDailyResearchAllowance({
        studyUsageRepo,
        userId: 'u1',
        characterId: 'ageha',
        limit: 1,
        now: () => new Date(clockMs),
      });
      expect(await other.tryConsume()).toBe(true);
      expect(await other.tryConsume()).toBe(false);

      const { result } = await run(allowanceFor(1));
      expect(result.requestsProcessed).toBe(1);
    });
  });
  it('依頼（StudyTopic pending）を消費し done に遷移する', async () => {
    const studyTopic = await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-1',
      topic: '最新アニメ情報',
      priority: 10,
      status: 'pending',
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(result.outcome).toBe('acquired');
    expect(result.requestsProcessed).toBe(1);
    expect(result.webRawWritten).toBe(1);
    expect(result.webSearchCalls).toBe(3);

    const topics = await studyTopicRepo.listByStatus('u1', 'hiyori', 'done');
    expect(topics).toHaveLength(1);
    expect(topics[0].topicId).toBe('req-1');

    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    expect(webraws[0].query).toBe('最新アニメ情報');
    // 依頼消費（§1）は Origin='request' + 依頼文・依頼日を StudyTopic から引き継ぐ（甲-1）
    expect(webraws[0].origin).toBe('request');
    expect(webraws[0].requestText).toBe('最新アニメ情報');
    expect(webraws[0].requestedAt).toBe(studyTopic.createdAt);
  });

  it('鮮度切れ fact が変化ありの場合、WEBRAW を書き NextReview を前方更新する', async () => {
    await freshnessCheckRequestRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      subject: '桜まつり',
      canonicalSummary: '桜まつりの話題',
      category: 'イベント',
      care: 1,
      embedding: [0.1],
    });
    const fact = await topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      text: '去年の桜まつりは3月下旬でした。',
      sourceUrls: [],
      volatility: 'high',
      observedAt: NOW_MS - 100_000,
      nextReview: NOW_MS - 1000,
    });

    const researchClient = makeResearchClient(async () =>
      makeResearchResult({ summary: '今年の桜まつりは4月上旬開催予定です。' })
    );
    const changeDetector = makeChangeDetector(true);

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      // 鮮度切れ処理だけで予算を使い切らせ、同一 Topic への care 自発の重複実行を避ける
      maxQueriesPerRun: 1,
    });

    expect(result.staleRefreshed).toBe(1);
    expect(result.webSearchCalls).toBe(3);
    expect(result.staleChanged).toBe(1);
    expect(result.webRawWritten).toBe(1);

    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    // 鮮度切れ再取得（§2）は Origin='stale' で書く（甲-1）
    expect(webraws[0].origin).toBe('stale');
    expect(webraws[0].requestText).toBeUndefined();

    const updatedFacts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
    const updated = updatedFacts.find((f) => f.factId === fact.factId);
    expect(updated?.nextReview).toBeGreaterThan(NOW_MS);
  });

  it('鮮度切れ fact が変化なしの場合、WEBRAW は書かないが NextReview は前方更新する', async () => {
    await freshnessCheckRequestRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      subject: '桜まつり',
      canonicalSummary: '桜まつりの話題',
      category: 'イベント',
      care: 1,
      embedding: [0.1],
    });
    const fact = await topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      text: '今年の桜まつりは4月上旬に開催される予定です。',
      sourceUrls: [],
      volatility: 'high',
      observedAt: NOW_MS - 100_000,
      nextReview: NOW_MS - 1000,
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector(false);

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      // 鮮度切れ処理だけで予算を使い切らせ、同一 Topic への care 自発の重複実行を避ける
      maxQueriesPerRun: 1,
    });

    expect(result.staleRefreshed).toBe(1);
    expect(result.staleChanged).toBe(0);
    expect(result.webRawWritten).toBe(0);

    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(0);

    const updatedFacts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
    const updated = updatedFacts.find((f) => f.factId === fact.factId);
    expect(updated?.nextReview).toBeGreaterThan(NOW_MS);
  });

  describe('鮮度確認の依頼の処理', () => {
    async function seedStaleTopic(topicId: string): Promise<void> {
      await freshnessCheckRequestRepo.put({ userId: 'u1', characterId: 'hiyori', topicId });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId,
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId,
        factId: `${topicId}-fact`,
        text: '去年の桜まつりは3月下旬でした。',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });
    }

    it('Topic の読み取りに失敗した依頼は、調べずに残す', async () => {
      await seedStaleTopic('topic-1');
      jest.spyOn(topicRepo, 'getTopic').mockRejectedValueOnce(new Error('一時的な障害'));
      const researchClient = makeResearchClient();

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector: makeChangeDetector(true),
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      expect(researchClient.research).not.toHaveBeenCalled();
      expect(result.staleRefreshed).toBe(0);
      const remaining = await freshnessCheckRequestRepo.listByCharacter('u1', 'hiyori');
      expect(remaining.map((r) => r.topicId)).toEqual(['topic-1']);
    });

    it('依頼の削除に失敗しても、処理を続ける', async () => {
      await seedStaleTopic('topic-1');
      jest
        .spyOn(freshnessCheckRequestRepo, 'delete')
        .mockRejectedValueOnce(new Error('削除の障害'));
      const researchClient = makeResearchClient();

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector: makeChangeDetector(true),
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      expect(result.outcome).toBe('acquired');
      expect(result.staleRefreshed).toBe(1);
      // 消せなかった依頼は残るが、fact の期限は前進済みのため次の回では調べ直さない
      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      expect(facts.every((f) => (f.nextReview ?? 0) > NOW_MS)).toBe(true);
    });

    it('同一トピックの複数期限切れ fact をまとめて research 1 回にする', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-a',
        text: '去年の桜まつりは3月下旬でした。',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-b',
        text: '会場は毎年同じ公園です。',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(true);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        // 鮮度切れ処理だけで予算を使い切らせる
        maxQueriesPerRun: 1,
      });

      // fact は 2 件だが research（budget 消費）は 1 回にまとめる
      expect(researchClient.research).toHaveBeenCalledTimes(1);
      expect(researchClient.research).toHaveBeenCalledWith('桜まつり 最新情報', character);
      expect(result.staleRefreshed).toBe(1);
      expect(result.webSearchCalls).toBe(3);

      // 変化検知の existingText は対象 fact 全部の Text を改行区切りで連結したもの
      expect(changeDetector.hasChanged).toHaveBeenCalledTimes(1);
      const [existingText] = (changeDetector.hasChanged as jest.Mock).mock.calls[0];
      expect(existingText).toBe('去年の桜まつりは3月下旬でした。\n会場は毎年同じ公園です。');
    });

    it('対象 fact 全部の NextReview を Volatility ごとに前進させる', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-a',
        text: '去年の桜まつりは3月下旬でした。',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-b',
        text: '会場は毎年同じ公園です。',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      expect(result.staleFactsReviewed).toBe(2);

      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      const factA = facts.find((f) => f.factId === 'fact-a');
      const factB = facts.find((f) => f.factId === 'fact-b');
      expect(factA?.nextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.high);
      expect(factB?.nextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.medium);
    });

    it('複数 fact があっても変化なしなら WEBRAW を書かない', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '桜まつり',
        canonicalSummary: '桜まつりの話題',
        category: 'イベント',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-a',
        text: '去年の桜まつりは3月下旬でした。',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-b',
        text: '会場は毎年同じ公園です。',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      expect(result.staleChanged).toBe(0);
      expect(result.webRawWritten).toBe(0);
      const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
      expect(webraws).toHaveLength(0);
    });

    it('budget はトピック単位で消費される（fact 数ではなく research 回数）', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-2',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '話題1',
        canonicalSummary: '',
        category: 'テスト',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-1-a',
        text: 'テキストA',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 3000,
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-1-b',
        text: 'テキストB',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 2000,
      });

      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-2',
        subject: '話題2',
        canonicalSummary: '',
        category: 'テスト',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-2',
        factId: 'fact-2-a',
        text: 'テキストC',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        // fact 総数は 3 件だがトピックは 2 つ。budget=2 あれば両方処理し切れる
        maxQueriesPerRun: 2,
      });

      expect(researchClient.research).toHaveBeenCalledTimes(2);
      expect(result.staleRefreshed).toBe(2);
      expect(result.staleFactsReviewed).toBe(3);
    });

    async function seedTopic(topicId: string, nextReview: number | undefined): Promise<void> {
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId,
        subject: `話題-${topicId}`,
        canonicalSummary: '',
        category: 'テスト',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId,
        factId: `fact-${topicId}`,
        text: `事実-${topicId}`,
        sourceUrls: [],
        volatility: nextReview === undefined ? 'stable' : 'high',
        observedAt: NOW_MS - 100_000,
        ...(nextReview !== undefined && { nextReview }),
      });
    }

    const listRequestIds = async (): Promise<string[]> =>
      (await freshnessCheckRequestRepo.listByCharacter('u1', 'hiyori')).map((r) => r.topicId);

    const baseParams = () => ({
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient: makeResearchClient(),
      changeDetector: makeChangeDetector(false),
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    it('依頼が無ければ、期限切れの fact があっても調べない', async () => {
      await seedTopic('topic-1', NOW_MS - 1000);
      const params = baseParams();

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(params.researchClient.research).not.toHaveBeenCalled();
      expect(result.staleRefreshed).toBe(0);
    });

    it('Topic が無い依頼は、調べずに消す', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'missing',
      });
      const params = baseParams();

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(params.researchClient.research).not.toHaveBeenCalled();
      expect(result.staleRefreshed).toBe(0);
      expect(await listRequestIds()).toEqual([]);
    });

    it('期限切れの fact が無い (既に新しい) 依頼は、調べずに消す', async () => {
      await seedTopic('fresh', NOW_MS + 1000);
      await seedTopic('stable', undefined);
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'fresh',
      });
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'stable',
      });
      const params = baseParams();

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 2 });

      expect(params.researchClient.research).not.toHaveBeenCalled();
      expect(result.staleRefreshed).toBe(0);
      expect(await listRequestIds()).toEqual([]);
    });

    it('依頼の古い順に処理し、処理した依頼を消す。予算で止まった分は残す', async () => {
      await seedTopic('older', NOW_MS - 1000);
      await seedTopic('newer', NOW_MS - 1000);
      // 新しい依頼を先に put しても、依頼時刻の古い方から処理する
      const store = new InMemorySingleTableStore();
      const clock = { t: NOW_MS - 5000 };
      const repo = new InMemoryFreshnessCheckRequestRepository(store, () => clock.t);
      clock.t = NOW_MS - 1000;
      await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 'newer' });
      clock.t = NOW_MS - 5000;
      await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 'older' });
      const params = { ...baseParams(), freshnessCheckRequestRepo: repo };

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(params.researchClient.research).toHaveBeenCalledTimes(1);
      expect(params.researchClient.research).toHaveBeenCalledWith('話題-older 最新情報', character);
      expect(result.staleRefreshed).toBe(1);
      const remaining = (await repo.listByCharacter('u1', 'hiyori')).map((r) => r.topicId);
      expect(remaining).toEqual(['newer']);
    });

    it('枠が使えず止まったときは、依頼を残す', async () => {
      await seedTopic('topic-1', NOW_MS - 1000);
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      const params = { ...baseParams(), researchAllowance: { tryConsume: async () => false } };

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(params.researchClient.research).not.toHaveBeenCalled();
      expect(result.dailyLimitReached).toBe(true);
      expect(await listRequestIds()).toEqual(['topic-1']);
      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      expect(facts[0].nextReview).toBe(NOW_MS - 1000);
    });

    it('research が失敗しても、依頼を消して fact の NextReview を前進させる', async () => {
      await seedTopic('topic-1', NOW_MS - 1000);
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      const params = {
        ...baseParams(),
        researchClient: makeResearchClient(async () => {
          throw new Error('research failed');
        }),
      };

      const result = await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(result.staleRefreshed).toBe(0);
      expect(await listRequestIds()).toEqual([]);
      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      expect(facts[0].nextReview).toBeGreaterThan(NOW_MS);
    });

    it('他のキャラクターの依頼は処理しない', async () => {
      await seedTopic('topic-1', NOW_MS - 1000);
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'ageha',
        topicId: 'topic-1',
      });
      const params = baseParams();

      await acquireForUser('u1', 'hiyori', { ...params, maxQueriesPerRun: 1 });

      expect(params.researchClient.research).not.toHaveBeenCalled();
    });

    it('失敗時（research 例外）でも対象 fact 全部の NextReview を前進させる', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '失敗トピック',
        canonicalSummary: '',
        category: 'テスト',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-a',
        text: '既知の事実A',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 2000,
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-b',
        text: '既知の事実B',
        sourceUrls: [],
        volatility: 'medium',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });

      const researchClient: IResearchClient = {
        research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
      };
      const changeDetector = makeChangeDetector();

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      // research 失敗のため staleRefreshed は増えないが、fact の NextReview は
      // best-effort で 2 件とも前進する（poison pill による budget starvation を防ぐ）。
      expect(result.staleRefreshed).toBe(0);
      expect(result.webSearchCalls).toBe(0);
      expect(result.staleChanged).toBe(0);
      expect(result.staleFactsReviewed).toBe(2);

      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      const factA = facts.find((f) => f.factId === 'fact-a');
      const factB = facts.find((f) => f.factId === 'fact-b');
      expect(factA?.nextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.high);
      expect(factB?.nextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.medium);
    });

    it('research が失敗し続けても試行回数は budget で頭打ちになる', async () => {
      for (let i = 0; i < 5; i++) {
        await freshnessCheckRequestRepo.put({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: `topic-${i}`,
        });
        await topicRepo.putTopic({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: `topic-${i}`,
          subject: `話題${i}`,
          canonicalSummary: '',
          category: 'テスト',
          care: 1,
          embedding: [0.1],
        });
        await topicRepo.putWebFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: `topic-${i}`,
          text: `事実${i}`,
          sourceUrls: [],
          volatility: 'high',
          observedAt: NOW_MS - 100_000,
          nextReview: NOW_MS - 1000 - i,
        });
      }

      const researchClient: IResearchClient = {
        research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
      };

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector: makeChangeDetector(),
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 3,
      });

      expect(researchClient.research).toHaveBeenCalledTimes(3);
      expect(result.staleRefreshed).toBe(0);
    });

    it('Subject が既に「最新情報」で終わる場合はクエリを二重付与しない', async () => {
      await freshnessCheckRequestRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
      });
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        subject: '芸能人の最新情報',
        canonicalSummary: '',
        category: 'テスト',
        care: 1,
        embedding: [0.1],
      });
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'topic-1',
        factId: 'fact-a',
        text: '既知の事実',
        sourceUrls: [],
        volatility: 'high',
        observedAt: NOW_MS - 100_000,
        nextReview: NOW_MS - 1000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        freshnessCheckRequestRepo,
        researchAllowance,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 1,
      });

      expect(researchClient.research).toHaveBeenCalledWith('芸能人の最新情報', character);
    });
  });

  it('care 降順の自発リサーチを行い WEBRAW を書く', async () => {
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-low',
      subject: '低 care トピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 1,
      embedding: [0.1],
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-high',
      subject: '高 care トピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 9,
      embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      maxQueriesPerRun: 1,
    });

    expect(result.selfStudied).toBe(1);
    expect(result.webSearchCalls).toBe(3);
    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    expect(webraws[0].query).toContain('高 care トピック');
    // care 自発リサーチ（§3）は Origin='auto' で書く（甲-1）
    expect(webraws[0].origin).toBe('auto');
    expect(webraws[0].requestText).toBeUndefined();
  });

  it('直近取得済み（クールダウン中）の care 上位 Topic はスキップし、未取得の下位 Topic を研究する', async () => {
    // 高 care だが直近取得済み（stable fact で ObservedAt が新しい）→ スキップ対象
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-recent',
      subject: '直近取得済みトピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 9,
      embedding: [0.1],
    });
    await topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-recent',
      text: '既知',
      sourceUrls: [],
      volatility: 'stable', // NextReview 無し → 鮮度掃引には出ない
      observedAt: NOW_MS - 1000, // クールダウン（24h）内
    });
    // 低 care だが未取得 → 研究対象
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-cold',
      subject: '未取得トピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 3,
      embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      maxQueriesPerRun: 1,
    });

    expect(result.selfStudied).toBe(1);
    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    expect(webraws[0].query).toContain('未取得トピック');
  });

  it('ピーク時は care 自発をスキップするが依頼・鮮度切れは実施する', async () => {
    await freshnessCheckRequestRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
    });
    const lifecycle = makeLifecycle({
      userActivityProfile: {
        morningPeak: '14:00',
        eveningPeak: '21:00',
        sampleSize: 10,
        lastLearnedAt: '2026-06-01T00:00:00Z',
      },
    });

    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-1',
      topic: '依頼トピック',
      priority: 10,
      status: 'pending',
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      subject: '鮮度切れトピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 1,
      embedding: [0.1],
    });
    await topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      text: '既知の事実',
      sourceUrls: [],
      volatility: 'high',
      observedAt: NOW_MS - 100_000,
      nextReview: NOW_MS - 1000,
    });
    // care 自発の対象になり得る、別 Topic（鮮度切れ fact は無い）
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-care',
      subject: 'care 自発対象',
      canonicalSummary: '',
      category: 'テスト',
      care: 100,
      embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle,
      now: () => awakeNonPeak,
      maxQueriesPerRun: 3,
    });

    expect(result.requestsProcessed).toBe(1);
    expect(result.staleRefreshed).toBe(1);
    expect(result.selfStudied).toBe(0);
  });

  it('maxQueriesPerRun 上限を 3 ソース合算で消費する', async () => {
    for (let i = 0; i < 3; i++) {
      await studyTopicRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: `req-${i}`,
        topic: `依頼トピック${i}`,
        priority: 10,
        status: 'pending',
      });
    }
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-care',
      subject: 'care 自発対象',
      canonicalSummary: '',
      category: 'テスト',
      care: 100,
      embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      // 既定 ACQUIRE_MAX_QUERIES_PER_RUN を明示的に使う
    });

    expect(researchClient.research).toHaveBeenCalledTimes(ACQUIRE_MAX_QUERIES_PER_RUN);
    expect(result.requestsProcessed).toBe(3);
    // 依頼 3 件で予算を使い切るため care 自発は実施されない
    expect(result.selfStudied).toBe(0);
  });

  it('依頼のリサーチ失敗は pending へ戻され、次回バッチで再試行できる', async () => {
    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-fail',
      topic: '失敗トピック',
      priority: 10,
      status: 'pending',
    });

    const researchClient: IResearchClient = {
      research: jest.fn().mockRejectedValue(new Error('API エラー')),
    };
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(result.requestsProcessed).toBe(0);
    // in_progress のまま滞留させず pending へ戻す（次回 listByStatus('pending') で再試行）。
    const stuck = await studyTopicRepo.listByStatus('u1', 'hiyori', 'in_progress');
    expect(stuck).toHaveLength(0);
    const pending = await studyTopicRepo.listByStatus('u1', 'hiyori', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].topicId).toBe('req-fail');
  });

  it('依頼が処理前に削除されていたら、その依頼だけスキップして次の依頼を処理する', async () => {
    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-gone',
      topic: '消えた依頼',
      priority: 10,
      status: 'pending',
    });
    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-alive',
      topic: '残っている依頼',
      priority: 5,
      status: 'pending',
    });
    const updateStatus = jest.spyOn(studyTopicRepo, 'updateStatus');
    updateStatus.mockRejectedValueOnce(new EntityNotFoundError('StudyTopic', 'req-gone'));

    const researchClient = makeResearchClient();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector: makeChangeDetector(),
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(researchClient.research).toHaveBeenCalledTimes(1);
    expect(researchClient.research).toHaveBeenCalledWith('残っている依頼', character);
    expect(result.requestsProcessed).toBe(1);
    const done = await studyTopicRepo.listByStatus('u1', 'hiyori', 'done');
    expect(done.map((t) => t.topicId)).toEqual(['req-alive']);
  });

  it('リサーチ後に依頼が削除されていても、pending へ戻そうとせず次へ進む', async () => {
    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-gone',
      topic: '消えた依頼',
      priority: 10,
      status: 'pending',
    });
    const original = studyTopicRepo.updateStatus.bind(studyTopicRepo);
    const updateStatus = jest.spyOn(studyTopicRepo, 'updateStatus');
    // in_progress への更新は通し、done への更新で消えていた状況を再現する
    updateStatus
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new EntityNotFoundError('StudyTopic', 'req-gone'));

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient: makeResearchClient(),
      changeDetector: makeChangeDetector(),
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(result.outcome).toBe('acquired');
    expect(result.requestsProcessed).toBe(0);
    expect(updateStatus).toHaveBeenCalledTimes(2);
  });

  it('鮮度切れの再取得が失敗しても他の処理を継続する（fail-warn）', async () => {
    await freshnessCheckRequestRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      subject: '失敗トピック',
      canonicalSummary: '',
      category: 'テスト',
      care: 1,
      embedding: [0.1],
    });
    await topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      text: '既知の事実',
      sourceUrls: [],
      volatility: 'high',
      observedAt: NOW_MS - 100_000,
      nextReview: NOW_MS - 1000,
    });

    const researchClient: IResearchClient = {
      research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
    };
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(result.outcome).toBe('acquired');
    expect(result.staleRefreshed).toBe(0);
    expect(result.staleChanged).toBe(0);

    // 再取得失敗でも NextReview は前方更新する（poison pill による budget starvation を防ぐ）。
    // high の再検証間隔（1 日）だけ前進し、掃引窓から外れる。
    const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
    expect(facts[0].nextReview).toBe(NOW_MS + 24 * 60 * 60 * 1000);
  });

  it('care 自発リサーチの失敗は握って他の Topic を継続する（fail-warn）', async () => {
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-fail',
      subject: '失敗する話題',
      canonicalSummary: '',
      category: 'テスト',
      care: 9,
      embedding: [0.1],
    });
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-ok',
      subject: '成功する話題',
      canonicalSummary: '',
      category: 'テスト',
      care: 1,
      embedding: [0.1],
    });

    const researchClient: IResearchClient = {
      research: jest
        .fn()
        .mockRejectedValueOnce(new Error('リサーチ API エラー'))
        .mockResolvedValueOnce(makeResearchResult()),
    };
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      maxQueriesPerRun: 2,
    });

    expect(result.selfStudied).toBe(1);
    expect(result.webRawWritten).toBe(1);
    // 例外で終わった呼び出しは回数を取れないため、成功した 1 回分だけを数える
    expect(result.webSearchCalls).toBe(3);
  });

  it('research が webSearchCalls を返さない場合は 0 として扱う', async () => {
    await studyTopicRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'req-nocount',
      topic: '件数なし',
      priority: 10,
      status: 'pending',
    });
    const researchClient = makeResearchClient(async (query) =>
      makeResearchResult({ topic: query, webSearchCalls: undefined })
    );

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      studyTopicRepo,
      researchClient,
      changeDetector: makeChangeDetector(),
      character,
      lifecycle: makeLifecycle(),
      researchAllowance: { tryConsume: async () => true },
      now: () => awakeNonPeak,
    });

    expect(result.requestsProcessed).toBe(1);
    expect(result.webSearchCalls).toBe(0);
  });

  it('now 未指定でも既定（現在時刻）で動作する', async () => {
    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
      freshnessCheckRequestRepo,
      researchAllowance,
      studyTopicRepo,
      researchClient,
      changeDetector,
      character,
      lifecycle: makeLifecycle(),
      // now は未指定 → 既定値（実時刻）を使う
    });

    // 実行時刻に応じて awake/skipped どちらもあり得るため、例外なく完了することのみ検証する
    expect(['acquired', 'skipped']).toContain(result.outcome);
  });
});
