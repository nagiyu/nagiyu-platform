import { InMemorySingleTableStore } from '@nagiyu/aws';
import { acquireForUser, shouldAcquireNow } from '../../../src/usecases/acquire.usecase.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';
import { InMemoryStudyTopicRepository } from '../../../src/repositories/in-memory-study-topic.repository.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';
import type { IResearchClient, ResearchResult } from '../../../src/research/types.js';
import type { IWebFactChangeDetector } from '../../../src/research/web-fact-change-detector.js';
import { ACQUIRE_MAX_QUERIES_PER_RUN } from '../../../src/constants.js';

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
    await studyTopicRepo.put({
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

  it('依頼のリサーチ失敗は in_progress のまま次回再試行され、他は継続する', async () => {
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
    const topics = await studyTopicRepo.listByStatus('u1', 'hiyori', 'in_progress');
    expect(topics).toHaveLength(1);
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

    // NextReview は前方更新されない（再取得自体が失敗したため）
    const facts = await topicRepo.listWebFacts('u1', 'hiyori', 'topic-1');
    expect(facts[0].NextReview).toBe(NOW_MS - 1000);
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
