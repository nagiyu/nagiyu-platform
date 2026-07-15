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
  ...overrides,
});

const makeTopicResult = (overrides: Partial<TopicResult> = {}): TopicResult => ({
  targetTopicId: '',
  subject: 'コーヒー',
  category: '飲み物',
  canonicalSummary: 'ユーザーはコーヒーが好き',
  requestText: '',
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
  listStaleWebFacts: repo.listStaleWebFacts.bind(repo),
  updateWebFactNextReview: repo.updateWebFactNextReview.bind(repo),
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
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'コーヒーが好き',
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
    expect(headers[0].Care).toBe(1);
    expect(headers[0].Subject).toBe('コーヒー');
    expect(headers[0].Embedding).toEqual([0.5, 0.5]);

    const selfFacts = await topicRepo.listSelfFacts('u1', 'hiyori', headers[0].TopicID);
    expect(selfFacts).toHaveLength(1);
    expect(selfFacts[0].Text).toBe('ユーザーは猫を飼っている');

    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', headers[0].TopicID);
    expect(webFacts).toHaveLength(1);
    expect(webFacts[0].Text).toBe('コーヒーには覚醒作用がある');
  });

  it('既存 Topic への merge で care がインクリメントされる（expectedUpdatedAt 指定）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    // 候補となる既存 Topic を投入（Embedding は routing 用の固定ベクトルと同じにして必ず候補入りさせる）
    const existing = await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-EXISTING',
      Subject: 'コーヒー',
      CanonicalSummary: '以前の要約',
      Category: '飲み物',
      Care: 3,
      Embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: '今日もコーヒーを飲んだ',
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
    expect(headers[0].TopicID).toBe('TOPIC-EXISTING');
    expect(headers[0].Care).toBe(4);
    expect(headers[0].CanonicalSummary).toBe('更新された要約');
    expect(headers[0].CreatedAt).toBe(existing.CreatedAt);
  });

  it('同一の既存 targetTopicId を LLM が複数返しても OptimisticLockError にならない（dedup）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    const existing = await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-EXISTING',
      Subject: 'コーヒー',
      CanonicalSummary: '以前の要約',
      Category: '飲み物',
      Care: 3,
      Embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: '今日もコーヒーを飲んだ。あと豆も買った',
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
      (call) => call[0].TopicID === 'TOPIC-EXISTING'
    );
    expect(existingTopicPutCalls).toHaveLength(1);

    const headers = await topicRepo.listTopicHeaders('u1', 'hiyori');
    expect(headers).toHaveLength(1);
    expect(headers[0].TopicID).toBe('TOPIC-EXISTING');
    // Care は +1 のみ（2 件分を二重加算しない）
    expect(headers[0].Care).toBe(existing.Care + 1);
    // グループ内で最後に出現したエントリの要約が採用される
    expect(headers[0].CanonicalSummary).toBe('2件目（最終）の要約');

    // 両エントリの selfFacts/webFacts が両方追記される（取りこぼしなし）
    const selfFacts = await topicRepo.listSelfFacts('u1', 'hiyori', 'TOPIC-EXISTING');
    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', 'TOPIC-EXISTING');
    expect(selfFacts.map((f) => f.Text).sort()).toEqual(
      ['1件目の自己事実', '2件目の自己事実'].sort()
    );
    expect(webFacts.map((f) => f.Text).sort()).toEqual(['1件目のWeb事実', '2件目のWeb事実'].sort());

    // カーソルが前進する
    const cursor = await cursorRepo.get('u1', 'hiyori');
    expect(cursor?.MsgCursor).toBeGreaterThan(0);
  });

  it('merge 時の expectedUpdatedAt は candidateMap ではなくベーステーブル（getTopic）の現在値を使う', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-EXISTING',
      Subject: 'コーヒー',
      CanonicalSummary: '以前の要約',
      Category: '飲み物',
      Care: 3,
      Embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: '今日もコーヒーを飲んだ',
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
    const putCall = putTopicSpy.mock.calls.find((call) => call[0].TopicID === 'TOPIC-EXISTING');
    expect(putCall?.[1]).toEqual({ expectedUpdatedAt: getTopicResult?.UpdatedAt });
  });

  it('候補に無い targetTopicId を LLM が返したら新規扱いになる（hallucination 保険）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    await topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-EXISTING',
      Subject: 'コーヒー',
      CanonicalSummary: '以前の要約',
      Category: '飲み物',
      Care: 3,
      Embedding: [1, 0],
    });

    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: '新しい話題',
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
    const existingHeader = headers.find((h) => h.TopicID === 'TOPIC-EXISTING');
    expect(existingHeader?.Care).toBe(3);
    const newHeader = headers.find((h) => h.TopicID !== 'TOPIC-EXISTING');
    expect(newHeader?.Care).toBe(1);
  });

  it('カーソルはストリーム別に消費分の最大 CreatedAt まで前進する（空ストリームは据え置き）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: '1件目' });
    const firstMsgCreatedAt = tick - 1;
    tick += 100;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: '2件目' });
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
    expect(cursor?.MsgCursor).toBe(secondMsgCreatedAt);
    // WebRaw は 0 件のまま（据え置き。now() へは飛ばない）
    expect(cursor?.WebrawCursor).toBe(0);
  });

  it('WebRaw のみ新着がある場合は WebrawCursor のみ前進し MsgCursor は据え置き', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

    tick = fixedNow;
    await webRawRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Query: 'コーヒー 効能',
      RawText: 'コーヒーには覚醒作用がある',
      SourceUrls: ['https://example.com'],
      Origin: 'auto',
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
    expect(cursor?.WebrawCursor).toBe(rawCreatedAt);
    expect(cursor?.MsgCursor).toBe(0);
  });

  it('webFact の NextReview が volatility 別に設定される（stable は undefined）', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

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
    const webFacts = await topicRepo.listWebFacts('u1', 'hiyori', headers[0].TopicID);
    const byText = new Map(webFacts.map((f) => [f.Text, f]));

    expect(byText.get('stable fact')?.NextReview).toBeUndefined();
    expect(byText.get('low fact')?.NextReview).toBe(readAt + 30 * 24 * 60 * 60 * 1000);
    expect(byText.get('medium fact')?.NextReview).toBe(readAt + 7 * 24 * 60 * 60 * 1000);
    expect(byText.get('high fact')?.NextReview).toBe(readAt + 1 * 24 * 60 * 60 * 1000);
    expect(byText.get('stable fact')?.ObservedAt).toBe(readAt);
  });

  it('at-least-once: putSelfFact が失敗すると例外が伝播し、カーソルは前進しない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

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
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: '1回目' });

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
      expect.objectContaining({ UserID: 'u1', CharacterID: 'hiyori' }),
      { expectedUpdatedAt: undefined }
    );

    const firstCursor = await cursorRepo.get('u1', 'hiyori');

    tick += 1000;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: '2回目' });

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
      expect.objectContaining({ UserID: 'u1', CharacterID: 'hiyori' }),
      { expectedUpdatedAt: firstCursor?.UpdatedAt }
    );
  });

  it('完全成功後の再実行は "skipped" になり重複集約しない', async () => {
    const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

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
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: longText,
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
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: `TOPIC-${i}`,
        Subject: `話題${i}`,
        CanonicalSummary: `要約${i}`,
        Category: 'その他',
        Care: 1,
        Embedding: [1, 0],
      });
    }

    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

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

  describe('依頼由来 provenance（甲-1）', () => {
    it('request-origin WebRaw を LLM が該当 Topic に requestText エコーすると Topic に依頼フックが焼かれる', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      const requestedAt = fixedNow - 3_600_000;
      await webRawRepo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: '最新アニメ情報',
        RawText: '今期は〇〇が人気です',
        SourceUrls: ['https://example.com'],
        Origin: 'request',
        RequestText: '最新アニメ情報を調べて',
        RequestedAt: requestedAt,
      });

      const llmClient = makeLLMClient([makeTopicResult({ requestText: '最新アニメ情報を調べて' })]);

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
      expect(headers[0].RequestText).toBe('最新アニメ情報を調べて');
      expect(headers[0].RequestedAt).toBe(requestedAt);
    });

    it('突合できない requestText（今回バッチに該当する request WebRaw が無い）は捏造とみなし依頼フックを付けない', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'コーヒーが好き',
      });

      const llmClient = makeLLMClient([makeTopicResult({ requestText: '捏造された依頼文' })]);

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
      expect(headers[0].RequestText).toBeUndefined();
      expect(headers[0].RequestedAt).toBeUndefined();
    });

    it('既存 Topic への merge で今回依頼なしの場合、既存の依頼フックを引き継ぐ', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      const existing = await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-EXISTING',
        Subject: 'コーヒー',
        CanonicalSummary: '以前の要約',
        Category: '飲み物',
        Care: 3,
        Embedding: [1, 0],
        RequestText: '前回の依頼文',
        RequestedAt: fixedNow - 100_000,
      });

      tick = fixedNow;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: '今日もコーヒーを飲んだ',
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
      expect(headers[0].RequestText).toBe('前回の依頼文');
      expect(headers[0].RequestedAt).toBe(existing.RequestedAt);
    });

    it('LLM エコーの requestText が原文と大小・空白違いでも、保存される RequestText は権威ある WebRaw 原文になる（fresh-eyes レビュー軽微#2）', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();
      tick = fixedNow;
      const requestedAt = fixedNow - 3_600_000;
      await webRawRepo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: '新幹線 プレミアム席',
        RawText: '新幹線のプレミアム席は〇〇です',
        SourceUrls: ['https://example.com'],
        Origin: 'request',
        RequestText: '新幹線のプレミアム席',
        RequestedAt: requestedAt,
      });

      // LLM のエコーは大文字小文字・前後空白が原文とずれている想定
      const llmClient = makeLLMClient([makeTopicResult({ requestText: ' 新幹線のプレミアム席 ' })]);

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
      // 保存されるのは LLM エコー（前後空白付き）ではなく WebRaw の権威ある原文
      expect(headers[0].RequestText).toBe('新幹線のプレミアム席');
      expect(headers[0].RequestedAt).toBe(requestedAt);
    });

    it('既存 Topic への merge で group 先頭エントリが依頼・最終エントリが非依頼でも依頼フックが解決される（fresh-eyes レビュー軽微#7）', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-EXISTING',
        Subject: 'コーヒー',
        CanonicalSummary: '以前の要約',
        Category: '飲み物',
        Care: 3,
        Embedding: [1, 0],
      });

      tick = fixedNow;
      const requestedAt = fixedNow - 1_000;
      await webRawRepo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: 'コーヒー 最新情報',
        RawText: '新しい調査結果',
        SourceUrls: [],
        Origin: 'request',
        RequestText: 'コーヒーの新情報を調べて',
        RequestedAt: requestedAt,
      });

      // group 先頭エントリ（1件目）は依頼を持つが、group 内で採用される最終エントリ
      // （last、2件目）は依頼なし（requestText: ''）
      const llmClient = makeLLMClient([
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '1件目の要約',
          requestText: 'コーヒーの新情報を調べて',
          selfFacts: [makeSelfFact({ text: '1件目の自己事実' })],
          webFacts: [makeWebFact({ text: '1件目のWeb事実' })],
        }),
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '2件目（最終）の要約',
          requestText: '',
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
      // META は last（2件目）の要約を採用しつつ、依頼フックは 1 件目から解決される
      expect(headers[0].CanonicalSummary).toBe('2件目（最終）の要約');
      expect(headers[0].RequestText).toBe('コーヒーの新情報を調べて');
      expect(headers[0].RequestedAt).toBe(requestedAt);
    });

    it('既存 Topic への merge で今回依頼ありの場合、新しい依頼フックで上書きする', async () => {
      const { topicRepo, messageRepo, webRawRepo, cursorRepo } = makeRepos();

      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-EXISTING',
        Subject: 'コーヒー',
        CanonicalSummary: '以前の要約',
        Category: '飲み物',
        Care: 3,
        Embedding: [1, 0],
        RequestText: '前回の依頼文',
        RequestedAt: fixedNow - 100_000,
      });

      tick = fixedNow;
      const newRequestedAt = fixedNow - 500;
      await webRawRepo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: 'コーヒー 最新情報',
        RawText: '新しい調査結果',
        SourceUrls: [],
        Origin: 'request',
        RequestText: '今度はコーヒーの新情報を調べて',
        RequestedAt: newRequestedAt,
      });

      const llmClient = makeLLMClient([
        makeTopicResult({
          targetTopicId: 'TOPIC-EXISTING',
          canonicalSummary: '更新された要約',
          requestText: '今度はコーヒーの新情報を調べて',
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
      expect(headers[0].RequestText).toBe('今度はコーヒーの新情報を調べて');
      expect(headers[0].RequestedAt).toBe(newRequestedAt);
    });
  });
});
