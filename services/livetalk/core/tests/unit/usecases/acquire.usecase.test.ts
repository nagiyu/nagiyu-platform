import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  acquireForUser,
  shouldAcquireNow,
  buildLatestInfoQuery,
} from '../../../src/usecases/acquire.usecase.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';
import { InMemoryStudyTopicRepository } from '../../../src/repositories/in-memory-study-topic.repository.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';
import type { IResearchClient, ResearchResult } from '../../../src/research/types.js';
import type { IWebFactChangeDetector } from '../../../src/research/web-fact-change-detector.js';
import {
  ACQUIRE_MAX_QUERIES_PER_RUN,
  ACQUIRE_STALE_SWEEP_LIMIT,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../../../src/constants.js';

const makeLifecycle = (overrides: Partial<LifecycleEntity> = {}): LifecycleEntity => ({
  UserID: 'u1',
  CharacterID: 'hiyori',
  Bedtime: '01:30',
  WakeUpTime: '09:30',
  CreatedAt: 1_700_000_000_000,
  UpdatedAt: 1_700_000_000_000,
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
      UserActivityProfile: {
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
  });

  it('就寝中は全スキップする', async () => {
    const sleeping = new Date(2026, 4, 31, 3, 0, 0);
    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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

  it('依頼（StudyTopic pending）を消費し done に遷移する', async () => {
    const studyTopic = await studyTopicRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'req-1',
      Topic: '最新アニメ情報',
      Priority: 10,
      Status: 'pending',
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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

    const topics = await studyTopicRepo.listByStatus('u1', 'hiyori', 'done');
    expect(topics).toHaveLength(1);
    expect(topics[0].TopicID).toBe('req-1');

    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    expect(webraws[0].Query).toBe('最新アニメ情報');
    // 依頼消費（§1）は Origin='request' + 依頼文・依頼日を StudyTopic から引き継ぐ（甲-1）
    expect(webraws[0].Origin).toBe('request');
    expect(webraws[0].RequestText).toBe('最新アニメ情報');
    expect(webraws[0].RequestedAt).toBe(studyTopic.CreatedAt);
  });

  it('鮮度切れ fact が変化ありの場合、WEBRAW を書き NextReview を前方更新する', async () => {
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Subject: '桜まつり',
      CanonicalSummary: '桜まつりの話題',
      Category: 'イベント',
      Care: 1,
      Embedding: [0.1],
    });
    const fact = await topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Text: '去年の桜まつりは3月下旬でした。',
      SourceUrls: [],
      Volatility: 'high',
      ObservedAt: NOW_MS - 100_000,
      NextReview: NOW_MS - 1000,
    });

    const researchClient = makeResearchClient(async () =>
      makeResearchResult({ summary: '今年の桜まつりは4月上旬開催予定です。' })
    );
    const changeDetector = makeChangeDetector(true);

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    expect(result.staleChanged).toBe(1);
    expect(result.webRawWritten).toBe(1);

    const webraws = await webRawRepo.listSince('u1', 'hiyori', 0);
    expect(webraws).toHaveLength(1);
    // 鮮度切れ再取得（§2）は Origin='stale' で書く（甲-1）
    expect(webraws[0].Origin).toBe('stale');
    expect(webraws[0].RequestText).toBeUndefined();

    const updatedFacts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
    const updated = updatedFacts.find((f) => f.FactID === fact.FactID);
    expect(updated?.NextReview).toBeGreaterThan(NOW_MS);
  });

  it('鮮度切れ fact が変化なしの場合、WEBRAW は書かないが NextReview は前方更新する', async () => {
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Subject: '桜まつり',
      CanonicalSummary: '桜まつりの話題',
      Category: 'イベント',
      Care: 1,
      Embedding: [0.1],
    });
    const fact = await topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Text: '今年の桜まつりは4月上旬に開催される予定です。',
      SourceUrls: [],
      Volatility: 'high',
      ObservedAt: NOW_MS - 100_000,
      NextReview: NOW_MS - 1000,
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector(false);

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    const updated = updatedFacts.find((f) => f.FactID === fact.FactID);
    expect(updated?.NextReview).toBeGreaterThan(NOW_MS);
  });

  describe('鮮度切れ再取得のトピック単位集約（#3781）', () => {
    it('同一トピックの複数期限切れ fact をまとめて research 1 回にする', async () => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '桜まつり',
        CanonicalSummary: '桜まつりの話題',
        Category: 'イベント',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-a',
        Text: '去年の桜まつりは3月下旬でした。',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-b',
        Text: '会場は毎年同じ公園です。',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(true);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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

      // 変化検知の existingText は対象 fact 全部の Text を改行区切りで連結したもの
      expect(changeDetector.hasChanged).toHaveBeenCalledTimes(1);
      const [existingText] = (changeDetector.hasChanged as jest.Mock).mock.calls[0];
      expect(existingText).toBe('去年の桜まつりは3月下旬でした。\n会場は毎年同じ公園です。');
    });

    it('対象 fact 全部の NextReview を Volatility ごとに前進させる', async () => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '桜まつり',
        CanonicalSummary: '桜まつりの話題',
        Category: 'イベント',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-a',
        Text: '去年の桜まつりは3月下旬でした。',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-b',
        Text: '会場は毎年同じ公園です。',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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
      const factA = facts.find((f) => f.FactID === 'fact-a');
      const factB = facts.find((f) => f.FactID === 'fact-b');
      expect(factA?.NextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.high);
      expect(factB?.NextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.medium);
    });

    it('複数 fact があっても変化なしなら WEBRAW を書かない', async () => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '桜まつり',
        CanonicalSummary: '桜まつりの話題',
        Category: 'イベント',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-a',
        Text: '去年の桜まつりは3月下旬でした。',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-b',
        Text: '会場は毎年同じ公園です。',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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

    it('窓（ACQUIRE_STALE_SWEEP_LIMIT）外に落ちた同トピックの期限切れ fact も前進する', async () => {
      // 他トピックのダミー期限切れ fact を ACQUIRE_STALE_SWEEP_LIMIT - 1 件分、
      // 対象トピックの fact より古い NextReview で用意し、窓（上位 limit 件）を埋める。
      // トピックヘッダは置かず、getTopic=null のフォールバック経路で単純に消費させる。
      for (let i = 0; i < ACQUIRE_STALE_SWEEP_LIMIT - 1; i++) {
        await topicRepo.putWebFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: `filler-${i}`,
          FactID: `filler-fact-${i}`,
          Text: `ダミー事実${i}`,
          SourceUrls: [],
          Volatility: 'high',
          ObservedAt: NOW_MS - 900_000,
          NextReview: NOW_MS - 900_000 - i,
        });
      }

      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '桜まつり',
        CanonicalSummary: '桜まつりの話題',
        Category: 'イベント',
        Care: 1,
        Embedding: [0.1],
      });
      // 窓（上位 ACQUIRE_STALE_SWEEP_LIMIT 件）にちょうど収まる古さの fact
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-in-window',
        Text: '窓内の事実。',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 800_000,
      });
      // 窓には収まらないが、期限切れではある（NextReview<=nowMs）同一トピックの fact
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-out-of-window',
        Text: '窓外の事実。',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });

      // 窓には確かに fact-in-window までしか含まれず、fact-out-of-window は含まれないことを確認
      const window = await topicRepo.listStaleWebFacts(
        'u1',
        'hiyori',
        NOW_MS,
        ACQUIRE_STALE_SWEEP_LIMIT
      );
      expect(window.some((f) => f.FactID === 'fact-out-of-window')).toBe(false);
      expect(window.some((f) => f.FactID === 'fact-in-window')).toBe(true);

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        // フィラー（フォールバック経路、fact 単位）ACQUIRE_STALE_SWEEP_LIMIT-1 件 + topic-1（束ね 1 回）
        maxQueriesPerRun: ACQUIRE_STALE_SWEEP_LIMIT,
      });

      expect(result.staleRefreshed).toBe(ACQUIRE_STALE_SWEEP_LIMIT);

      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      const inWindow = facts.find((f) => f.FactID === 'fact-in-window');
      const outOfWindow = facts.find((f) => f.FactID === 'fact-out-of-window');
      // 窓外だった fact-out-of-window も、topic-1 の research 実行時に
      // listWebFacts で取り直されて NextReview が前進する
      expect(inWindow?.NextReview).toBeGreaterThan(NOW_MS);
      expect(outOfWindow?.NextReview).toBeGreaterThan(NOW_MS);
    });

    it('budget はトピック単位で消費される（fact 数ではなく research 回数）', async () => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '話題1',
        CanonicalSummary: '',
        Category: 'テスト',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-1-a',
        Text: 'テキストA',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 3000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-1-b',
        Text: 'テキストB',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });

      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-2',
        Subject: '話題2',
        CanonicalSummary: '',
        Category: 'テスト',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-2',
        FactID: 'fact-2-a',
        Text: 'テキストC',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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

    it('トピック欠落（getTopic が null）時は fact 単位でフォールバックする（束ねない）', async () => {
      // Topic ヘッダを作らず WEB fact だけ 2 件用意する（トピック欠落を模す）
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'missing-topic',
        FactID: 'fact-a',
        Text: '欠落トピックの事実A',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'missing-topic',
        FactID: 'fact-b',
        Text: '欠落トピックの事実B',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(true);

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
        studyTopicRepo,
        researchClient,
        changeDetector,
        character,
        lifecycle: makeLifecycle(),
        now: () => awakeNonPeak,
        maxQueriesPerRun: 2,
      });

      // 束ねられず fact 単位で research するため 2 回消費する
      expect(researchClient.research).toHaveBeenCalledTimes(2);
      expect(researchClient.research).toHaveBeenCalledWith('欠落トピックの事実A', character);
      expect(researchClient.research).toHaveBeenCalledWith('欠落トピックの事実B', character);
      expect(result.staleRefreshed).toBe(2);
      expect(result.staleFactsReviewed).toBe(2);

      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'missing-topic');
      expect(facts.every((f) => (f.NextReview ?? 0) > NOW_MS)).toBe(true);
    });

    it('失敗時（research 例外）でも対象 fact 全部の NextReview を前進させる', async () => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '失敗トピック',
        CanonicalSummary: '',
        Category: 'テスト',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-a',
        Text: '既知の事実A',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 2000,
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-b',
        Text: '既知の事実B',
        SourceUrls: [],
        Volatility: 'medium',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });

      const researchClient: IResearchClient = {
        research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
      };
      const changeDetector = makeChangeDetector();

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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
      expect(result.staleChanged).toBe(0);
      expect(result.staleFactsReviewed).toBe(2);

      const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
      const factA = facts.find((f) => f.FactID === 'fact-a');
      const factB = facts.find((f) => f.FactID === 'fact-b');
      expect(factA?.NextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.high);
      expect(factB?.NextReview).toBe(NOW_MS + WEBFACT_REVIEW_INTERVAL_MS.medium);
    });

    it('research が失敗し続けても試行回数は budget で頭打ちになる', async () => {
      for (let i = 0; i < 5; i++) {
        await topicRepo.putTopic({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: `topic-${i}`,
          Subject: `話題${i}`,
          CanonicalSummary: '',
          Category: 'テスト',
          Care: 1,
          Embedding: [0.1],
        });
        await topicRepo.putWebFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: `topic-${i}`,
          Text: `事実${i}`,
          SourceUrls: [],
          Volatility: 'high',
          ObservedAt: NOW_MS - 100_000,
          NextReview: NOW_MS - 1000 - i,
        });
      }

      const researchClient: IResearchClient = {
        research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
      };

      const result = await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        Subject: '芸能人の最新情報',
        CanonicalSummary: '',
        Category: 'テスト',
        Care: 1,
        Embedding: [0.1],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-1',
        FactID: 'fact-a',
        Text: '既知の事実',
        SourceUrls: [],
        Volatility: 'high',
        ObservedAt: NOW_MS - 100_000,
        NextReview: NOW_MS - 1000,
      });

      const researchClient = makeResearchClient();
      const changeDetector = makeChangeDetector(false);

      await acquireForUser('u1', 'hiyori', {
        topicRepo,
        webRawRepo,
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
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-low',
      Subject: '低 care トピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 1,
      Embedding: [0.1],
    });
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-high',
      Subject: '高 care トピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 9,
      Embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    expect(webraws[0].Query).toContain('高 care トピック');
    // care 自発リサーチ（§3）は Origin='auto' で書く（甲-1）
    expect(webraws[0].Origin).toBe('auto');
    expect(webraws[0].RequestText).toBeUndefined();
  });

  it('直近取得済み（クールダウン中）の care 上位 Topic はスキップし、未取得の下位 Topic を研究する', async () => {
    // 高 care だが直近取得済み（stable fact で ObservedAt が新しい）→ スキップ対象
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-recent',
      Subject: '直近取得済みトピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 9,
      Embedding: [0.1],
    });
    await topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-recent',
      Text: '既知',
      SourceUrls: [],
      Volatility: 'stable', // NextReview 無し → 鮮度掃引には出ない
      ObservedAt: NOW_MS - 1000, // クールダウン（24h）内
    });
    // 低 care だが未取得 → 研究対象
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-cold',
      Subject: '未取得トピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 3,
      Embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    expect(webraws[0].Query).toContain('未取得トピック');
  });

  it('ピーク時は care 自発をスキップするが依頼・鮮度切れは実施する', async () => {
    const lifecycle = makeLifecycle({
      UserActivityProfile: {
        morningPeak: '14:00',
        eveningPeak: '21:00',
        sampleSize: 10,
        lastLearnedAt: '2026-06-01T00:00:00Z',
      },
    });

    await studyTopicRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'req-1',
      Topic: '依頼トピック',
      Priority: 10,
      Status: 'pending',
    });
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Subject: '鮮度切れトピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 1,
      Embedding: [0.1],
    });
    await topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Text: '既知の事実',
      SourceUrls: [],
      Volatility: 'high',
      ObservedAt: NOW_MS - 100_000,
      NextReview: NOW_MS - 1000,
    });
    // care 自発の対象になり得る、別 Topic（鮮度切れ fact は無い）
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-care',
      Subject: 'care 自発対象',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 100,
      Embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: `req-${i}`,
        Topic: `依頼トピック${i}`,
        Priority: 10,
        Status: 'pending',
      });
    }
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-care',
      Subject: 'care 自発対象',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 100,
      Embedding: [0.1],
    });

    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'req-fail',
      Topic: '失敗トピック',
      Priority: 10,
      Status: 'pending',
    });

    const researchClient: IResearchClient = {
      research: jest.fn().mockRejectedValue(new Error('API エラー')),
    };
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    expect(pending[0].TopicID).toBe('req-fail');
  });

  it('鮮度切れの再取得が失敗しても他の処理を継続する（fail-warn）', async () => {
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Subject: '失敗トピック',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 1,
      Embedding: [0.1],
    });
    await topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      Text: '既知の事実',
      SourceUrls: [],
      Volatility: 'high',
      ObservedAt: NOW_MS - 100_000,
      NextReview: NOW_MS - 1000,
    });

    const researchClient: IResearchClient = {
      research: jest.fn().mockRejectedValue(new Error('リサーチ API エラー')),
    };
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
    expect(facts[0].NextReview).toBe(NOW_MS + 24 * 60 * 60 * 1000);
  });

  it('care 自発リサーチの失敗は握って他の Topic を継続する（fail-warn）', async () => {
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-fail',
      Subject: '失敗する話題',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 9,
      Embedding: [0.1],
    });
    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-ok',
      Subject: '成功する話題',
      CanonicalSummary: '',
      Category: 'テスト',
      Care: 1,
      Embedding: [0.1],
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
  });

  it('now 未指定でも既定（現在時刻）で動作する', async () => {
    const researchClient = makeResearchClient();
    const changeDetector = makeChangeDetector();

    const result = await acquireForUser('u1', 'hiyori', {
      topicRepo,
      webRawRepo,
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
