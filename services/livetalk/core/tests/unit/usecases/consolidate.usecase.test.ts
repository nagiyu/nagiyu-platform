import { InMemorySingleTableStore } from '@nagiyu/aws';
import { consolidate } from '../../../src/usecases/consolidate.usecase.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryMessageRepository } from '../../../src/repositories/in-memory-message.repository.js';
import { InMemoryWebRawRepository } from '../../../src/repositories/in-memory-webraw.repository.js';
import { InMemoryConsolidationCursorRepository } from '../../../src/repositories/in-memory-consolidation-cursor.repository.js';
import type { ILLMClient, IEmbeddingClient } from '../../../src/llm-client/types.js';
import type { ConsolidationRaw } from '../../../src/llm-client/schemas/consolidation.schema.js';
import type { TopicRepository } from '../../../src/repositories/topic.repository.interface.js';
import {
  CONSOLIDATION_ROUTING_TEXT_MAX_CHARS,
  TOPIC_ROUTING_MAX_CANDIDATES,
  WEB_FACT_TOPIC_LIMIT,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../../../src/constants.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

type TopicResult = ConsolidationRaw['topics'][number];

const makeLLMClient = (topics: TopicResult[]): ILLMClient & { chatStructuredCalls: number } => {
  let chatStructuredCalls = 0;
  return {
    async *chatStream() {
      yield '';
    },
    async chatComplete() {
      return '';
    },
    async chatStructured() {
      chatStructuredCalls++;
      return { topics } as unknown as never;
    },
    get chatStructuredCalls() {
      return chatStructuredCalls;
    },
  };
};

/** 固定ベクトルを返すだけの Embedding クライアント（テキスト内容には依存しない） */
const makeEmbeddingClient = (vector: number[] = [1, 0]): IEmbeddingClient => ({
  embed: async () => vector,
});

const makeRepos = () => {
  const store = new InMemorySingleTableStore();
  tick = fixedNow;
  const nowMs = () => tick;
  const ulidFactory = () => `ULID-${tick++}`;

  return {
    store,
    topicRepo: new InMemoryTopicRepository(store, ulidFactory, nowMs),
    messageRepo: new InMemoryMessageRepository(store, ulidFactory, nowMs),
    webRawRepo: new InMemoryWebRawRepository(store, ulidFactory, nowMs),
    cursorRepo: new InMemoryConsolidationCursorRepository(store, nowMs),
  };
};

const makeSelfFact = (overrides: Partial<TopicResult['selfFacts'][number]> = {}) => ({
  text: 'ユーザーは猫を飼っている',
  provenance: '「うちの猫が〜」という発話より',
  ...overrides,
});

const makeWebFact = (
  overrides: Partial<TopicResult['webFacts'][number]> = {}
): TopicResult['webFacts'][number] => ({
  text: 'コーヒーには覚醒作用がある',
  sourceUrls: ['https://example.com'],
  volatility: 'stable',
  action: 'add',
  existingFactIndices: [],
  ...overrides,
});

const makeTopicResult = (overrides: Partial<TopicResult> = {}): TopicResult => ({
  targetTopicId: '',
  subject: 'コーヒー',
  category: '飲み物',
  canonicalSummary: 'ユーザーはコーヒーが好き',
  sourceRequestIndices: [],
  selfFacts: [makeSelfFact()],
  webFacts: [makeWebFact()],
  ...overrides,
});

/**
 * `topicRepo.putSelfFact` だけ throw する TopicRepository を作る（at-least-once 検証用）。
 * 他メソッドは実体にそのまま委譲する。
 */
const withFailingPutSelfFact = (repo: TopicRepository): TopicRepository => ({
  putTopic: repo.putTopic.bind(repo),
  getTopic: repo.getTopic.bind(repo),
  getTopicBundle: repo.getTopicBundle.bind(repo),
  listTopicHeaders: repo.listTopicHeaders.bind(repo),
  listTopicHeadersByCareDesc: repo.listTopicHeadersByCareDesc.bind(repo),
  putSelfFact: async () => {
    throw new Error('putSelfFact 失敗');
  },
  listSelfFacts: repo.listSelfFacts.bind(repo),
  deleteSelfFact: repo.deleteSelfFact.bind(repo),
  putWebFact: repo.putWebFact.bind(repo),
  listWebFacts: repo.listWebFacts.bind(repo),
  updateWebFactNextReview: repo.updateWebFactNextReview.bind(repo),
  deleteWebFact: repo.deleteWebFact.bind(repo),
  updateWebFactObservation: repo.updateWebFactObservation.bind(repo),
});

/**
 * `topicRepo.getTopic` だけ常に null を返す TopicRepository を作る
 * （防御的フォールバック経路＝ candidateMap には存在するがベーステーブルからは
 * 既に消えていたケースを検証するため）。他メソッドは実体にそのまま委譲する。
 */
const withNullGetTopic = (repo: TopicRepository): TopicRepository => ({
  putTopic: repo.putTopic.bind(repo),
  getTopic: async () => null,
  getTopicBundle: repo.getTopicBundle.bind(repo),
  listTopicHeaders: repo.listTopicHeaders.bind(repo),
  listTopicHeadersByCareDesc: repo.listTopicHeadersByCareDesc.bind(repo),
  putSelfFact: repo.putSelfFact.bind(repo),
  listSelfFacts: repo.listSelfFacts.bind(repo),
  deleteSelfFact: repo.deleteSelfFact.bind(repo),
  putWebFact: repo.putWebFact.bind(repo),
  listWebFacts: repo.listWebFacts.bind(repo),
  updateWebFactNextReview: repo.updateWebFactNextReview.bind(repo),
  deleteWebFact: repo.deleteWebFact.bind(repo),
  updateWebFactObservation: repo.updateWebFactObservation.bind(repo),
});

describe('consolidate', () => {
  it('未集約データが 0 件のとき "skipped" を返し、カーソルに触れない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    const llmClient = makeLLMClient([]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('skipped');
    expect(llmClient.chatStructuredCalls).toBe(0);
    expect(await cursorRepo.get('u1', 'hiyori')).toBeNull();
  });

  it('新規 Topic を作成する（care=1・embedding 付与・SELF/WEB 追記）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: 'コーヒーが好き',
    });

    const llmClient = makeLLMClient([makeTopicResult()]);
    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([0.5, 0.5]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].care).toBe(1);
    expect(headers[0].subject).toBe('コーヒー');
    expect(headers[0].embedding).toEqual([0.5, 0.5]);

    const selfFacts = await topicRepo.listSelfFacts('u1', 'hiyori', headers[0].topicId);
    expect(selfFacts).toHaveLength(1);
    expect(selfFacts[0].text).toBe('ユーザーは猫を飼っている');

    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', headers[0].topicId);
    expect(webFacts).toHaveLength(1);
    expect(webFacts[0].text).toBe('コーヒーには覚醒作用がある');
  });

  it('新規 Topic で WEB fact only（SELF なし）の fold は care=0 になる（自発リサーチ由来では上げない）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await webRawRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー 効能',
      rawText: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });

    const llmClient = makeLLMClient([makeTopicResult({ selfFacts: [] })]);
    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([0.5, 0.5]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].care).toBe(0);

    const selfFacts = await topicRepo.listSelfFacts('u1', 'hiyori', headers[0].topicId);
    expect(selfFacts).toHaveLength(0);
    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', headers[0].topicId);
    expect(webFacts).toHaveLength(1);
  });

  it('既存 Topic への merge で care がインクリメントされる（expectedUpdatedAt 指定）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    // 候補となる既存 Topic を投入（Embedding は routing 用の固定ベクトルと同じにして必ず候補入りさせる）
    const existing = await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: '今日もコーヒーを飲んだ',
    });

    const llmClient = makeLLMClient([
      makeTopicResult({ targetTopicId: 'TOPIC-EXISTING', canonicalSummary: '更新された要約' }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].topicId).toBe('TOPIC-EXISTING');
    expect(headers[0].care).toBe(4);
    expect(headers[0].canonicalSummary).toBe('更新された要約');
    expect(headers[0].createdAt).toBe(existing.createdAt);
  });

  it('既存 Topic への merge で WEB fact only（SELF なし）の fold は care が据え置きになる', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    const existing = await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await webRawRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー 効能',
      rawText: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });

    const putTopicSpy = jest.spyOn(topicRepo, 'putTopic');

    const llmClient = makeLLMClient([
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: '更新された要約（自発リサーチ由来）',
        selfFacts: [],
      }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].topicId).toBe('TOPIC-EXISTING');
    // SELF fact を伴わない fold のため care は据え置き（3 のまま）
    expect(headers[0].care).toBe(existing.care);
    expect(headers[0].canonicalSummary).toBe('更新された要約（自発リサーチ由来）');

    const putCall = putTopicSpy.mock.calls.find((call) => call[0].topicId === 'TOPIC-EXISTING');
    expect(putCall?.[0].care).toBe(existing.care);
  });

  it('既存 Topic への merge で複数エントリのうち一部だけ SELF fact を含む fold は care が +1 される（グループ合算判定）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    const existing = await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 2,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: 'コーヒー好きなんだ',
    });
    await webRawRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー 効能',
      rawText: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });

    const putTopicSpy = jest.spyOn(topicRepo, 'putTopic');

    // 同一 Topic を指す 2 エントリ（1 グループに畳まれる）。片方は WEB only・もう片方が SELF fact を含む。
    // countSelfFacts はグループ全エントリの合算なので、合計 > 0 → care +1 となる。
    const llmClient = makeLLMClient([
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: '自発リサーチ由来の断片',
        selfFacts: [],
      }),
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: '会話由来を含む更新された要約',
        selfFacts: [makeSelfFact()],
        webFacts: [],
      }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].topicId).toBe('TOPIC-EXISTING');
    // グループ合算で SELF fact ありのため care は +1（2 → 3）
    expect(headers[0].care).toBe(existing.care + 1);

    // META の put は 1 グループにつき 1 回（dedup 済み）で、その Care が +1 であること
    const putCalls = putTopicSpy.mock.calls.filter((call) => call[0].topicId === 'TOPIC-EXISTING');
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].care).toBe(existing.care + 1);
  });

  it('同一の既存 targetTopicId を LLM が複数返しても OptimisticLockError にならない（dedup）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    const existing = await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: '今日もコーヒーを飲んだ。あと豆も買った',
    });

    const putTopicSpy = jest.spyOn(topicRepo, 'putTopic');

    // LLM が同一 targetTopicId を持つ 2 エントリを返すケース
    // （同じ話題を 2 発話に分けて要約してしまった等の LLM の非決定性を想定）
    const llmClient = makeLLMClient([
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: '1件目の要約',
        selfFacts: [makeSelfFact({ text: '1件目の自己事実' })],
        webFacts: [makeWebFact({ text: '1件目のWeb事実' })],
      }),
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: '2件目（最終）の要約',
        selfFacts: [makeSelfFact({ text: '2件目の自己事実' })],
        webFacts: [makeWebFact({ text: '2件目のWeb事実' })],
      }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    // putTopic は既存 Topic に対して 1 回だけ呼ばれる（2 回目呼び出しで
    // candidateMap 由来の古い UpdatedAt を使ってしまうと OptimisticLockError になる）
    const existingTopicPutCalls = putTopicSpy.mock.calls.filter(
      (call) => call[0].topicId === 'TOPIC-EXISTING'
    );
    expect(existingTopicPutCalls).toHaveLength(1);

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].topicId).toBe('TOPIC-EXISTING');
    // Care は +1 のみ（2 件分を二重加算しない）
    expect(headers[0].care).toBe(existing.care + 1);
    // グループ内で最後に出現したエントリの要約が採用される
    expect(headers[0].canonicalSummary).toBe('2件目（最終）の要約');

    // 両エントリの selfFacts/webFacts が両方追記される（取りこぼしなし）
    const selfFacts = await topicRepo.listSelfFacts('u1', 'hiyori', 'TOPIC-EXISTING');
    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', 'TOPIC-EXISTING');
    expect(selfFacts.map((f) => f.text).sort()).toEqual(
      ['1件目の自己事実', '2件目の自己事実'].sort()
    );
    expect(webFacts.map((f) => f.text).sort()).toEqual(['1件目のWeb事実', '2件目のWeb事実'].sort());

    // カーソルが前進する
    const cursor = await cursorRepo.get('u1', 'hiyori');
    expect(cursor?.msgCursor).toBeGreaterThan(0);
  });

  it('merge 時の expectedUpdatedAt は candidateMap ではなくベーステーブル（getTopic）の現在値を使う', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: '今日もコーヒーを飲んだ',
    });

    const getTopicSpy = jest.spyOn(topicRepo, 'getTopic');
    const putTopicSpy = jest.spyOn(topicRepo, 'putTopic');

    const llmClient = makeLLMClient([
      makeTopicResult({ targetTopicId: 'TOPIC-EXISTING', canonicalSummary: '更新された要約' }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    // ベーステーブルから権威ある現在値を取り直している
    expect(getTopicSpy).toHaveBeenCalledWith({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
    });

    // getTopic が返した現在値の UpdatedAt が expectedUpdatedAt として使われている
    const getTopicResult = await getTopicSpy.mock.results[0].value;
    const putCall = putTopicSpy.mock.calls.find((call) => call[0].topicId === 'TOPIC-EXISTING');
    expect(putCall?.[1]).toEqual({ expectedUpdatedAt: getTopicResult?.updatedAt });
  });

  it('候補に無い targetTopicId を LLM が返したら新規扱いになる（hallucination 保険）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: '新しい話題',
    });

    const llmClient = makeLLMClient([
      makeTopicResult({ targetTopicId: 'HALLUCINATED-ID-NOT-IN-CANDIDATES' }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    // 既存 1 件 + 新規 1 件 = 2 件（既存はそのまま care=3、新規は care=1）
    expect(headers).toHaveLength(2);
    const existingHeader = headers.find((h) => h.topicId === 'TOPIC-EXISTING');
    expect(existingHeader?.care).toBe(3);
    const newHeader = headers.find((h) => h.topicId !== 'TOPIC-EXISTING');
    expect(newHeader?.care).toBe(1);
  });

  it('防御的フォールバック（getTopic が null）: WEB fact only の fold は新規 Topic の care=0 になる', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EXISTING',
      subject: 'コーヒー',
      canonicalSummary: '以前の要約',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
    });

    tick = fixedNow;
    await webRawRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー 効能',
      rawText: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });

    // getTopic だけ null を返す（候補一覧には出るがベーステーブルからは消えていた想定）
    const putTopicSpy = jest.spyOn(topicRepo, 'putTopic');
    const fallbackTopicRepo = withNullGetTopic(topicRepo);

    const llmClient = makeLLMClient([
      makeTopicResult({
        targetTopicId: 'TOPIC-EXISTING',
        canonicalSummary: 'フォールバック新規要約',
        selfFacts: [],
      }),
    ]);

    const outcome = await consolidate('u1', 'hiyori', {
      topicRepo: fallbackTopicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(outcome).toBe('consolidated');

    // フォールバックで新規 Topic として put される（TOPIC-EXISTING とは別 ID）
    const fallbackPutCall = putTopicSpy.mock.calls.find(
      (call) => call[0].topicId !== 'TOPIC-EXISTING'
    );
    expect(fallbackPutCall?.[0].care).toBe(0);
  });

  it('カーソルはストリーム別に消費分の最大 CreatedAt まで前進する（空ストリームは据え置き）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: '1件目' });
    const firstMsgCreatedAt = tick - 1;
    tick += 100;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: '2件目' });
    const secondMsgCreatedAt = tick - 1;
    expect(secondMsgCreatedAt).toBeGreaterThan(firstMsgCreatedAt);

    const llmClient = makeLLMClient([makeTopicResult()]);
    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow + 10_000,
    });

    const cursor = await cursorRepo.get('u1', 'hiyori');
    expect(cursor?.msgCursor).toBe(secondMsgCreatedAt);
    // WebRaw は 0 件のまま（据え置き。now() へは飛ばない）
    expect(cursor?.webrawCursor).toBe(0);
  });

  it('WebRaw のみ新着がある場合は WebrawCursor のみ前進し MsgCursor は据え置き', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    tick = fixedNow;
    await webRawRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      query: 'コーヒー 効能',
      rawText: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      origin: 'auto',
    });
    const rawCreatedAt = tick - 1;

    const llmClient = makeLLMClient([makeTopicResult()]);
    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow + 10_000,
    });

    const cursor = await cursorRepo.get('u1', 'hiyori');
    expect(cursor?.webrawCursor).toBe(rawCreatedAt);
    expect(cursor?.msgCursor).toBe(0);
  });

  it('webFact の NextReview が volatility 別に設定される（stable は undefined）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: 'テスト' });

    const readAt = fixedNow + 5_000;
    const llmClient = makeLLMClient([
      makeTopicResult({
        webFacts: [
          makeWebFact({ text: 'stable fact', volatility: 'stable' }),
          makeWebFact({ text: 'low fact', volatility: 'low' }),
          makeWebFact({ text: 'medium fact', volatility: 'medium' }),
          makeWebFact({ text: 'high fact', volatility: 'high' }),
        ],
      }),
    ]);

    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => readAt,
    });

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', headers[0].topicId);
    const byText = new Map(webFacts.map((f) => [f.text, f]));

    expect(byText.get('stable fact')?.nextReview).toBeUndefined();
    expect(byText.get('low fact')?.nextReview).toBe(readAt + 30 * 24 * 60 * 60 * 1000);
    expect(byText.get('medium fact')?.nextReview).toBe(readAt + 7 * 24 * 60 * 60 * 1000);
    expect(byText.get('high fact')?.nextReview).toBe(readAt + 1 * 24 * 60 * 60 * 1000);
    expect(byText.get('stable fact')?.observedAt).toBe(readAt);
  });

  it('at-least-once: putSelfFact が失敗すると例外が伝播し、カーソルは前進しない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: 'テスト' });

    const llmClient = makeLLMClient([makeTopicResult()]);
    const failingTopicRepo = withFailingPutSelfFact(topicRepo);

    await expect(
      consolidate('u1', 'hiyori', {
        topicRepo: failingTopicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow,
      })
    ).rejects.toThrow('putSelfFact 失敗');

    expect(await cursorRepo.get('u1', 'hiyori')).toBeNull();
  });

  it('二重処理防止: cursorRepo.put が expectedUpdatedAt 付きで呼ばれる', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    const putSpy = jest.spyOn(cursorRepo, 'put');

    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: '1回目' });

    const llmClient1 = makeLLMClient([makeTopicResult()]);
    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient: llmClient1,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    // 初回は cursor が存在しないので expectedUpdatedAt: undefined
    expect(putSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: 'u1', characterId: 'hiyori' }),
      { expectedUpdatedAt: undefined }
    );

    const firstCursor = await cursorRepo.get('u1', 'hiyori');

    tick += 1000;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: '2回目' });

    const llmClient2 = makeLLMClient([makeTopicResult()]);
    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient: llmClient2,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow + 2000,
    });

    // 2 回目は前回の UpdatedAt を expectedUpdatedAt として渡す（楽観ロック）
    expect(putSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: 'u1', characterId: 'hiyori' }),
      { expectedUpdatedAt: firstCursor?.updatedAt }
    );
  });

  it('完全成功後の再実行は "skipped" になり重複集約しない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: 'テスト' });

    const llmClient1 = makeLLMClient([makeTopicResult()]);
    const outcome1 = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient: llmClient1,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow,
    });
    expect(outcome1).toBe('consolidated');

    const llmClient2 = makeLLMClient([makeTopicResult()]);
    const outcome2 = await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient: llmClient2,
      embeddingClient: makeEmbeddingClient(),
      characterName: 'ひより',
      now: () => fixedNow + 5000,
    });
    expect(outcome2).toBe('skipped');
    expect(llmClient2.chatStructuredCalls).toBe(0);

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
  });

  it('ルーティング用テキストは末尾側から CONSOLIDATION_ROUTING_TEXT_MAX_CHARS 文字に切り詰められる', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    const longText = 'あ'.repeat(3000) + '末尾マーカー';
    tick = fixedNow;
    await messageRepo.create({
      userId: 'u1',
      characterId: 'hiyori',
      role: 'user',
      text: longText,
    });

    const embedCalls: string[] = [];
    const embeddingClient: IEmbeddingClient = {
      embed: async (text) => {
        embedCalls.push(text);
        return [1, 0];
      },
    };

    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient: makeLLMClient([makeTopicResult()]),
      embeddingClient,
      characterName: 'ひより',
      now: () => fixedNow,
    });

    // 最初の embed 呼び出しがルーティング用テキスト
    const routingText = embedCalls[0];
    expect(routingText.length).toBe(CONSOLIDATION_ROUTING_TEXT_MAX_CHARS);
    expect(routingText.endsWith('末尾マーカー')).toBe(true);
  });

  it('候補 Topic はプロンプトに TOPIC_ROUTING_MAX_CANDIDATES 件までしか渡さない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    // 上限を超える件数の既存 Topic を、いずれも閾値を超える類似度になるよう投入する
    for (let i = 0; i < TOPIC_ROUTING_MAX_CANDIDATES + 2; i++) {
      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: `TOPIC-${i}`,
        subject: `話題${i}`,
        canonicalSummary: `要約${i}`,
        category: 'その他',
        care: 1,
        embedding: [1, 0],
      });
    }

    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: 'テスト' });

    let capturedUserContent = '';
    const llmClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured(messages) {
        capturedUserContent = messages.find((m) => m.role === 'user')?.content ?? '';
        return { topics: [makeTopicResult()] } as unknown as never;
      },
    };

    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    const candidateLines = capturedUserContent.split('\n').filter((l) => l.includes('topicId:'));
    expect(candidateLines).toHaveLength(TOPIC_ROUTING_MAX_CANDIDATES);
  });

  it('既存の事実が上限を超える候補 Topic では、新しい側の WEB_FACT_TOPIC_LIMIT 件だけを番号付きで渡す', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    await topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-X',
      subject: '話題X',
      canonicalSummary: '要約X',
      category: 'その他',
      care: 1,
      embedding: [1, 0],
    });
    for (let i = 0; i < WEB_FACT_TOPIC_LIMIT + 1; i++) {
      await topicRepo.putWebFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-X',
        factId: `FX-${String(i).padStart(2, '0')}`,
        text: `既存本文F${String(i).padStart(2, '0')}`,
        sourceUrls: [],
        volatility: 'low',
        observedAt: 10_000 + i,
        nextReview: 99_000,
      });
    }
    tick = fixedNow;
    await messageRepo.create({ userId: 'u1', characterId: 'hiyori', role: 'user', text: 'テスト' });

    let capturedUserContent = '';
    const llmClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured(messages) {
        capturedUserContent = messages.find((m) => m.role === 'user')?.content ?? '';
        return { topics: [makeTopicResult()] } as unknown as never;
      },
    };

    await consolidate('u1', 'hiyori', {
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      characterName: 'ひより',
      now: () => fixedNow,
    });

    const factLines = capturedUserContent.split('\n').filter((l) => l.includes('[事実 #'));
    expect(factLines).toHaveLength(WEB_FACT_TOPIC_LIMIT);
    // 最も古い 1 件 (F00) だけが外れ、新しい側の F20 が先頭の番号 0 になる
    expect(capturedUserContent).not.toContain('既存本文F00');
    expect(factLines[0]).toContain('[事実 #0] 既存本文F20');
    expect(capturedUserContent).toContain('既存本文F01');
  });

  describe('依頼由来 provenance（甲-1 / index 参照方式）', () => {
    it('request-origin WebRaw を LLM が sourceRequestIndices:[0] で指すと、Topic に WebRaw の権威ある原文・日時が焼かれる', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      const requestedAt = fixedNow - 3_600_000;
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: '最新アニメ情報',
        rawText: '今期は〇〇が人気です',
        sourceUrls: ['https://example.com'],
        origin: 'request',
        requestText: '最新アニメ情報を調べて',
        requestedAt: requestedAt,
      });

      // LLM は依頼文をエコーせず、番号（index）だけを返す
      const llmClient = makeLLMClient([makeTopicResult({ sourceRequestIndices: [0] })]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      // RequestText/RequestedAt は GSI3 の射影に含まれないため getTopic（ベーステーブル読み）で確認する
      const topic = await topicRepo.getTopic({
        userId: headers[0].userId,
        characterId: headers[0].characterId,
        topicId: headers[0].topicId,
      });
      expect(topic?.requestText).toBe('最新アニメ情報を調べて');
      expect(topic?.requestedAt).toBe(requestedAt);
    });

    it('範囲外 index（requestWebRaws は 1 件しかないのに [5] を指す）は無視して依頼フックを付けない', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: '最新アニメ情報',
        rawText: '今期は〇〇が人気です',
        sourceUrls: ['https://example.com'],
        origin: 'request',
        requestText: '最新アニメ情報を調べて',
        requestedAt: fixedNow - 3_600_000,
      });

      // LLM の捏造・取り違えを想定した範囲外 index
      const llmClient = makeLLMClient([makeTopicResult({ sourceRequestIndices: [5] })]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      expect(headers[0].requestText).toBeUndefined();
      expect(headers[0].requestedAt).toBeUndefined();
    });

    it('sourceRequestIndices が空配列なら依頼フックを付けない', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      await messageRepo.create({
        userId: 'u1',
        characterId: 'hiyori',
        role: 'user',
        text: 'コーヒーが好き',
      });

      const llmClient = makeLLMClient([makeTopicResult({ sourceRequestIndices: [] })]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      expect(headers[0].requestText).toBeUndefined();
      expect(headers[0].requestedAt).toBeUndefined();
    });

    it('既存 Topic への merge で今回 indices が空の場合、既存の依頼フックを引き継ぐ', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      const existing = await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-EXISTING',
        subject: 'コーヒー',
        canonicalSummary: '以前の要約',
        category: '飲み物',
        care: 3,
        embedding: [1, 0],
        requestText: '前回の依頼文',
        requestedAt: fixedNow - 100_000,
      });

      tick = fixedNow;
      await messageRepo.create({
        userId: 'u1',
        characterId: 'hiyori',
        role: 'user',
        text: '今日もコーヒーを飲んだ',
      });

      const llmClient = makeLLMClient([
        makeTopicResult({ targetTopicId: 'TOPIC-EXISTING', canonicalSummary: '更新された要約' }),
      ]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient([1, 0]),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      // RequestText/RequestedAt は GSI3 の射影に含まれないため getTopic（ベーステーブル読み）で確認する
      const topic = await topicRepo.getTopic({
        userId: headers[0].userId,
        characterId: headers[0].characterId,
        topicId: headers[0].topicId,
      });
      expect(topic?.requestText).toBe('前回の依頼文');
      expect(topic?.requestedAt).toBe(existing.requestedAt);
    });

    it('既存 Topic への merge で group の複数エントリのうち片方だけ index を持つ場合でも依頼フックが解決される（fresh-eyes レビュー軽微#7 相当）', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-EXISTING',
        subject: 'コーヒー',
        canonicalSummary: '以前の要約',
        category: '飲み物',
        care: 3,
        embedding: [1, 0],
      });

      tick = fixedNow;
      const requestedAt = fixedNow - 1_000;
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: 'コーヒー 最新情報',
        rawText: '新しい調査結果',
        sourceUrls: [],
        origin: 'request',
        requestText: 'コーヒーの新情報を調べて',
        requestedAt: requestedAt,
      });

      // group 先頭エントリ（1件目）は index を持つが、group 内で採用される最終エントリ
      // （last、2件目）は index を持たない（sourceRequestIndices: []）
      const llmClient = makeLLMClient([
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '1件目の要約',
          sourceRequestIndices: [0],
          selfFacts: [makeSelfFact({ text: '1件目の自己事実' })],
          webFacts: [makeWebFact({ text: '1件目のWeb事実' })],
        }),
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '2件目（最終）の要約',
          sourceRequestIndices: [],
          selfFacts: [makeSelfFact({ text: '2件目の自己事実' })],
          webFacts: [makeWebFact({ text: '2件目のWeb事実' })],
        }),
      ]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient([1, 0]),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      // META は last（2件目）の要約を採用しつつ、依頼フックは 1 件目の index から解決される
      expect(headers[0].canonicalSummary).toBe('2件目（最終）の要約');
      // RequestText/RequestedAt は GSI3 の射影に含まれないため getTopic（ベーステーブル読み）で確認する
      const topic = await topicRepo.getTopic({
        userId: headers[0].userId,
        characterId: headers[0].characterId,
        topicId: headers[0].topicId,
      });
      expect(topic?.requestText).toBe('コーヒーの新情報を調べて');
      expect(topic?.requestedAt).toBe(requestedAt);
    });

    it('複数 index が指定された場合、最新の RequestedAt を持つ依頼が採用される', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      const olderRequestedAt = fixedNow - 100_000;
      const newerRequestedAt = fixedNow - 500;
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: 'コーヒー 過去の依頼',
        rawText: '過去の調査結果',
        sourceUrls: [],
        origin: 'request',
        requestText: '古い依頼文',
        requestedAt: olderRequestedAt,
      });
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: 'コーヒー 最新情報',
        rawText: '新しい調査結果',
        sourceUrls: [],
        origin: 'request',
        requestText: '新しい依頼文',
        requestedAt: newerRequestedAt,
      });

      // 両方の index（0, 1）を指定する
      const llmClient = makeLLMClient([makeTopicResult({ sourceRequestIndices: [0, 1] })]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      expect(headers).toHaveLength(1);
      // RequestText/RequestedAt は GSI3 の射影に含まれないため getTopic（ベーステーブル読み）で確認する
      const topic = await topicRepo.getTopic({
        userId: headers[0].userId,
        characterId: headers[0].characterId,
        topicId: headers[0].topicId,
      });
      expect(topic?.requestText).toBe('新しい依頼文');
      expect(topic?.requestedAt).toBe(newerRequestedAt);
    });

    it('既存 Topic への merge で今回 index ありの場合、新しい依頼フックで上書きする', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      await topicRepo.putTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-EXISTING',
        subject: 'コーヒー',
        canonicalSummary: '以前の要約',
        category: '飲み物',
        care: 3,
        embedding: [1, 0],
        requestText: '前回の依頼文',
        requestedAt: fixedNow - 100_000,
      });

      tick = fixedNow;
      const newRequestedAt = fixedNow - 500;
      await webRawRepo.put({
        userId: 'u1',
        characterId: 'hiyori',
        query: 'コーヒー 最新情報',
        rawText: '新しい調査結果',
        sourceUrls: [],
        origin: 'request',
        requestText: '今度はコーヒーの新情報を調べて',
        requestedAt: newRequestedAt,
      });

      const llmClient = makeLLMClient([
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '更新された要約',
          sourceRequestIndices: [0],
        }),
      ]);

      const outcome = await consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient([1, 0]),
        characterName: 'ひより',
        now: () => fixedNow,
      });

      expect(outcome).toBe('consolidated');
      const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
      // RequestText/RequestedAt は GSI3 の射影に含まれないため getTopic（ベーステーブル読み）で確認する
      const topic = await topicRepo.getTopic({
        userId: headers[0].userId,
        characterId: headers[0].characterId,
        topicId: headers[0].topicId,
      });
      expect(topic?.requestText).toBe('今度はコーヒーの新情報を調べて');
      expect(topic?.requestedAt).toBe(newRequestedAt);
    });
  });

  describe('WEB fact の見比べ（add / replace / duplicate）と上限', () => {
    const TOPIC_A = 'TOPIC-A';
    const TOPIC_B = 'TOPIC-B';
    const key = (topicId: string, factId: string) => ({
      userId: 'u1',
      characterId: 'hiyori',
      topicId,
      factId,
    });

    /** 既存 Topic を 2 つ (A / B) と、新しい順に番号が振られる WEB fact を用意する */
    const setup = async () => {
      const repos = makeRepos();
      const { topicRepo, messageRepo } = repos;
      for (const topicId of [TOPIC_A, TOPIC_B]) {
        await topicRepo.putTopic({
          userId: 'u1',
          characterId: 'hiyori',
          topicId,
          subject: topicId,
          canonicalSummary: '以前の要約',
          category: '飲み物',
          care: 1,
          embedding: [1, 0],
        });
      }
      // A: 番号 0 = FA-NEW(volatile high), 1 = FA-OLD(stable)。B: 番号 2 = FB-1
      await topicRepo.putWebFact({
        ...key(TOPIC_A, 'FA-OLD'),
        text: '古い事実',
        sourceUrls: [],
        volatility: 'stable',
        observedAt: 1_000,
      });
      await topicRepo.putWebFact({
        ...key(TOPIC_A, 'FA-NEW'),
        text: '新しい側の事実',
        sourceUrls: [],
        volatility: 'high',
        observedAt: 2_000,
        nextReview: 5_000,
      });
      await topicRepo.putWebFact({
        ...key(TOPIC_B, 'FB-1'),
        text: 'B の事実',
        sourceUrls: [],
        volatility: 'low',
        observedAt: 500,
        nextReview: 9_000,
      });
      tick = fixedNow;
      await messageRepo.create({
        userId: 'u1',
        characterId: 'hiyori',
        role: 'user',
        text: 'こんにちは',
      });
      return repos;
    };

    const run = async (
      repos: Awaited<ReturnType<typeof setup>>,
      topics: TopicResult[],
      topicRepo: TopicRepository = repos.topicRepo
    ) =>
      consolidate('u1', 'hiyori', {
        topicRepo,
        messageRepo: repos.messageRepo,
        webRawRepo: repos.webRawRepo,
        cursorRepo: repos.cursorRepo,
        llmClient: makeLLMClient(topics),
        embeddingClient: makeEmbeddingClient(),
        characterName: 'ひより',
        now: () => fixedNow + 100_000,
      });

    const factIds = async (repos: Awaited<ReturnType<typeof setup>>, topicId: string) =>
      (await repos.topicRepo.listWebFacts('u1', 'hiyori', topicId)).map((f) => f.factId).sort();

    it('add は新しい事実を追加し、既存の事実には触れない', async () => {
      const repos = await setup();
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [makeWebFact({ text: '別の事実', action: 'add' })],
        }),
      ]);
      const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
      expect(facts).toHaveLength(3);
      expect(facts.map((f) => f.factId)).toEqual(expect.arrayContaining(['FA-OLD', 'FA-NEW']));
    });

    it('replace は新しい事実を新しい createdAt で作り、番号が指す古い事実を削除する', async () => {
      const repos = await setup();
      const readAt = fixedNow + 100_000;
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [
            makeWebFact({
              text: '更新された事実',
              volatility: 'medium',
              action: 'replace',
              existingFactIndices: [0, 1],
            }),
          ],
        }),
      ]);
      const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
      expect(facts).toHaveLength(1);
      expect(facts[0].text).toBe('更新された事実');
      expect(facts[0].factId).not.toBe('FA-NEW');
      expect(facts[0].observedAt).toBe(readAt);
      expect(facts[0].createdAt).toBeGreaterThanOrEqual(fixedNow);
      expect(facts[0].nextReview).toBe(readAt + WEBFACT_REVIEW_INTERVAL_MS.medium);
    });

    it('replace は作成を先、削除を後に行う', async () => {
      const repos = await setup();
      const order: string[] = [];
      const spied: TopicRepository = {
        ...withNullGetTopic(repos.topicRepo),
        getTopic: repos.topicRepo.getTopic.bind(repos.topicRepo),
        putWebFact: async (input) => {
          order.push('put');
          return repos.topicRepo.putWebFact(input);
        },
        deleteWebFact: async (k) => {
          order.push('delete');
          return repos.topicRepo.deleteWebFact(k);
        },
      };
      await run(
        repos,
        [
          makeTopicResult({
            targetTopicId: TOPIC_A,
            selfFacts: [],
            webFacts: [makeWebFact({ action: 'replace', existingFactIndices: [0] })],
          }),
        ],
        spied
      );
      expect(order).toEqual(['put', 'delete']);
    });

    it('duplicate は新しい事実を保存せず、既存の事実の observedAt / nextReview だけ更新する', async () => {
      const repos = await setup();
      const readAt = fixedNow + 100_000;
      const before = (await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A)).find(
        (f) => f.factId === 'FA-NEW'
      );
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [makeWebFact({ action: 'duplicate', existingFactIndices: [0] })],
        }),
      ]);
      const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
      expect(facts).toHaveLength(2);
      const after = facts.find((f) => f.factId === 'FA-NEW');
      expect(after).toEqual({
        ...before,
        observedAt: readAt,
        nextReview: readAt + WEBFACT_REVIEW_INTERVAL_MS.high,
      });
      expect(after?.createdAt).toBe(before?.createdAt);
    });

    it('duplicate が stable を指すとき observedAt だけ更新し、nextReview は持たないまま', async () => {
      const repos = await setup();
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [makeWebFact({ action: 'duplicate', existingFactIndices: [1] })],
        }),
      ]);
      const stable = (await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A)).find(
        (f) => f.factId === 'FA-OLD'
      );
      expect(stable?.observedAt).toBe(fixedNow + 100_000);
      expect(stable?.nextReview).toBeUndefined();
    });

    it('範囲外・非整数・別 Topic の番号は無視し、有効な番号が残らなければ add として扱う', async () => {
      const repos = await setup();
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [
            // 2 は Topic B の事実、99 は範囲外、1.5 は非整数
            makeWebFact({ text: 'r', action: 'replace', existingFactIndices: [2, 99, 1.5, -1] }),
            makeWebFact({ text: 'd', action: 'duplicate', existingFactIndices: [2] }),
          ],
        }),
      ]);
      expect(await factIds(repos, TOPIC_B)).toEqual(['FB-1']);
      const a = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
      expect(a.map((f) => f.text).sort()).toEqual(['d', 'r', '古い事実', '新しい側の事実'].sort());
    });

    it('無効な番号が混ざっていても有効な番号だけで replace する', async () => {
      const repos = await setup();
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [
            makeWebFact({ text: 'r', action: 'replace', existingFactIndices: [0, 2, 99] }),
          ],
        }),
      ]);
      expect(await factIds(repos, TOPIC_B)).toEqual(['FB-1']);
      const a = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
      expect(a.map((f) => f.text).sort()).toEqual(['r', '古い事実']);
    });

    it('新規 Topic のエントリの replace / duplicate は add として扱う', async () => {
      const repos = await setup();
      await run(repos, [
        makeTopicResult({
          targetTopicId: '',
          subject: '新規',
          selfFacts: [],
          webFacts: [
            makeWebFact({ text: 'r', action: 'replace', existingFactIndices: [0] }),
            makeWebFact({ text: 'd', action: 'duplicate', existingFactIndices: [1] }),
          ],
        }),
      ]);
      expect(await factIds(repos, TOPIC_A)).toEqual(['FA-NEW', 'FA-OLD']);
      const headers = await repos.topicRepo.listTopicHeaders('u1', 'hiyori');
      const created = headers.find((h) => h.subject === '新規');
      const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', created!.topicId);
      expect(facts.map((f) => f.text).sort()).toEqual(['d', 'r']);
    });

    it('同じ古い事実を複数のエントリ・複数の新事実が指しても、削除は 1 回で duplicate の更新対象から外れる', async () => {
      const repos = await setup();
      const deleteSpy = jest.spyOn(repos.topicRepo, 'deleteWebFact');
      const updateSpy = jest.spyOn(repos.topicRepo, 'updateWebFactObservation');
      await run(repos, [
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [
            makeWebFact({ text: 'r1', action: 'replace', existingFactIndices: [0] }),
            makeWebFact({ text: 'r2', action: 'replace', existingFactIndices: [0] }),
          ],
        }),
        makeTopicResult({
          targetTopicId: TOPIC_A,
          selfFacts: [],
          webFacts: [
            makeWebFact({ text: 'r3', action: 'replace', existingFactIndices: [0] }),
            // 削除予定の 0 しか指さない duplicate は更新対象が無くなり add になる
            makeWebFact({ text: 'd1', action: 'duplicate', existingFactIndices: [0] }),
            // 1 は生きているので 2 回指されても更新は 1 回
            makeWebFact({ text: 'd2', action: 'duplicate', existingFactIndices: [1] }),
            makeWebFact({ text: 'd3', action: 'duplicate', existingFactIndices: [1] }),
          ],
        }),
      ]);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      const texts = (await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A))
        .map((f) => f.text)
        .sort();
      expect(texts).toEqual(['d1', 'r1', 'r2', 'r3', '古い事実'].sort());
    });

    describe('上限', () => {
      const seed = async (
        repos: Awaited<ReturnType<typeof setup>>,
        topicId: string,
        specs: Array<{ id: string; volatility: 'stable' | 'low'; observedAt: number }>
      ) => {
        for (const sp of specs) {
          await repos.topicRepo.putWebFact({
            ...key(topicId, sp.id),
            text: sp.id,
            sourceUrls: [],
            volatility: sp.volatility,
            observedAt: sp.observedAt,
            nextReview: sp.volatility === 'stable' ? undefined : sp.observedAt + 1,
          });
        }
      };

      const lowSpecs = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: `L-${String(i).padStart(2, '0')}`,
          volatility: 'low' as const,
          observedAt: 10_000 + i,
        }));
      const stableSpecs = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: `S-${String(i).padStart(2, '0')}`,
          volatility: 'stable' as const,
          observedAt: 10_000 + i,
        }));

      it('stable 以外が上限を超えたら観測日の古い順に削り、stable は残る', async () => {
        const repos = await setup();
        // setup の FA-NEW(high, 2000) + 20 件 = stable 以外 21 件。stable は FA-OLD の 1 件
        await seed(repos, TOPIC_A, lowSpecs(20));
        await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_A, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        const ids = await factIds(repos, TOPIC_A);
        // 1 件だけ、最も古い stable 以外の FA-NEW が消える
        expect(ids).toHaveLength(21);
        expect(ids).not.toContain('FA-NEW');
        expect(ids).toContain('L-00');
        expect(ids).toContain('FA-OLD');
      });

      it('stable が上限を超えたら観測日の古い順に削り、stable 以外は残る', async () => {
        const repos = await setup();
        // setup の FA-OLD(stable, 1000) + 10 件 = stable 11 件。stable 以外は FA-NEW の 1 件
        await seed(repos, TOPIC_A, stableSpecs(10));
        await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_A, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        const ids = await factIds(repos, TOPIC_A);
        // 1 件だけ、最も古い stable の FA-OLD が消える
        expect(ids).toHaveLength(11);
        expect(ids).not.toContain('FA-OLD');
        expect(ids).toContain('S-00');
        expect(ids).toContain('FA-NEW');
      });

      it('同じ観測日なら factId の小さい方から削る', async () => {
        const repos = await setup();
        await seed(repos, TOPIC_A, [
          { id: 'T-B', volatility: 'stable', observedAt: 500 },
          { id: 'T-A', volatility: 'stable', observedAt: 500 },
          ...stableSpecs(9),
        ]);
        // stable は FA-OLD(1000) を含めて 12 件 → 2 件削る。T-A, T-B (500) が先
        await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_A, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        const ids = await factIds(repos, TOPIC_A);
        expect(ids).not.toContain('T-A');
        expect(ids).not.toContain('T-B');
        expect(ids).toContain('FA-OLD');
      });

      it('stable が上限まであっても、新しく足した stable 以外の事実は消えない', async () => {
        const repos = await setup();
        // stable は FA-OLD + 9 件 = 上限の 10 件。stable 以外は FA-NEW の 1 件
        await seed(repos, TOPIC_A, stableSpecs(9));
        await run(repos, [
          makeTopicResult({
            targetTopicId: TOPIC_A,
            selfFacts: [],
            webFacts: [
              makeWebFact({ text: 'n1', volatility: 'low', action: 'add' }),
              makeWebFact({ text: 'n2', volatility: 'high', action: 'add' }),
            ],
          }),
        ]);
        const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', TOPIC_A);
        expect(facts.map((f) => f.text)).toEqual(expect.arrayContaining(['n1', 'n2']));
        expect(facts.filter((f) => f.volatility === 'stable')).toHaveLength(10);
        expect(facts.map((f) => f.factId)).toContain('FA-NEW');
        expect(facts).toHaveLength(13);
      });

      it('上限の適用に失敗しても集約は成功し、カーソルが進む', async () => {
        const repos = await setup();
        await seed(repos, TOPIC_A, lowSpecs(20));
        const deleteSpy = jest
          .spyOn(repos.topicRepo, 'deleteWebFact')
          .mockRejectedValue(new Error('削除に失敗'));
        const outcome = await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_A, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        expect(outcome).toBe('consolidated');
        expect(deleteSpy).toHaveBeenCalled();
        const cursor = await repos.cursorRepo.get('u1', 'hiyori');
        expect(cursor).not.toBeNull();
        expect(cursor!.msgCursor).toBeGreaterThan(0);
        // 削れなかった分は残り、次にその Topic に触れたとき追いつく
        expect(await factIds(repos, TOPIC_A)).toContain('FA-NEW');
      });

      it('新規 Topic にも上限が効く', async () => {
        const repos = await setup();
        await run(repos, [
          makeTopicResult({
            targetTopicId: '',
            subject: '新規',
            selfFacts: [],
            webFacts: Array.from({ length: 25 }, (_, i) =>
              makeWebFact({ text: `n${i}`, volatility: 'low', action: 'add' })
            ),
          }),
        ]);
        const headers = await repos.topicRepo.listTopicHeaders('u1', 'hiyori');
        const created = headers.find((h) => h.subject === '新規');
        const facts = await repos.topicRepo.listWebFacts('u1', 'hiyori', created!.topicId);
        expect(facts).toHaveLength(20);
      });

      it('SELF fact しか生まないエントリでも、触れた Topic は溜まった分を削る', async () => {
        const repos = await setup();
        await seed(
          repos,
          TOPIC_B,
          Array.from({ length: 30 }, (_, i) => ({
            id: `B-${String(i).padStart(2, '0')}`,
            volatility: 'low' as const,
            observedAt: 10_000 + i,
          }))
        );
        await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_B, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        const ids = await factIds(repos, TOPIC_B);
        expect(ids).toHaveLength(20);
        // 観測日の古い FB-1(500) と B-00.. から消える
        expect(ids).not.toContain('FB-1');
        expect(ids).not.toContain('B-00');
        expect(ids).toContain('B-29');
      });

      it('触れていない Topic は削らない', async () => {
        const repos = await setup();
        await seed(
          repos,
          TOPIC_B,
          Array.from({ length: 30 }, (_, i) => ({
            id: `B-${String(i).padStart(2, '0')}`,
            volatility: 'low' as const,
            observedAt: 10_000 + i,
          }))
        );
        await run(repos, [
          makeTopicResult({ targetTopicId: TOPIC_A, selfFacts: [makeSelfFact()], webFacts: [] }),
        ]);
        expect(await factIds(repos, TOPIC_B)).toHaveLength(31);
      });
    });
  });
});
