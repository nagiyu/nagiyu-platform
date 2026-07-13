import { detectCriticalTopic } from '../../../src/notification/escalation.js';
import type {
  DetectCriticalInput,
  DetectCriticalCandidate,
} from '../../../src/notification/escalation.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import { NOTIFY_CRITICAL_EVENT_HORIZON_DAYS } from '../../../src/constants.js';

// ---------------------------------------------------------------------------
// テストフィクスチャ
// ---------------------------------------------------------------------------

/** 今日を 2026-06-07（JST）とする */
const NOW = new Date('2026-06-07T10:00:00+09:00');

/** 近未来日付（今日 + 5 日 → horizon 14 日以内） */
const NEAR_FUTURE_DATE = '2026-06-12';

/** 遠未来日付（今日 + 20 日 → horizon 超過） */
const FAR_FUTURE_DATE = '2026-06-27';

/** 過去日付 */
const PAST_DATE = '2026-06-01';

/** ホライズン境界（今日 + 14 日、当日含む） */
const HORIZON_BOUNDARY = '2026-06-21';

/** ホライズン境界翌日（today + 15 日 → 超過） */
const OVER_HORIZON = '2026-06-22';

/** care 閾値（テスト全体で固定） */
const CARE_THRESHOLD = 3;

function makeTopic(overrides: Partial<TopicEntity> = {}): TopicEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 't1',
    Subject: 'テストトピック',
    CanonicalSummary: 'テスト要約',
    Category: 'ゲーム',
    Care: CARE_THRESHOLD,
    Embedding: [],
    CreatedAt: 1000,
    UpdatedAt: 1000,
    ...overrides,
  };
}

function makeWebFact(overrides: Partial<WebFactEntity> = {}): WebFactEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 't1',
    FactID: 'f1',
    Text: 'テスト内容',
    SourceUrls: [],
    Volatility: 'medium',
    ObservedAt: 1000,
    CreatedAt: 1000,
    ...overrides,
  };
}

function makeCandidate(
  topicOverrides: Partial<TopicEntity> = {},
  webFacts: WebFactEntity[] = [makeWebFact()]
): DetectCriticalCandidate {
  return { topic: makeTopic(topicOverrides), webFacts };
}

function makeLlmClient(eventDate: string | null, reason = '判定理由'): ILLMClient {
  return {
    chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
    chatComplete: jest.fn(),
    chatStructured: jest.fn().mockResolvedValue({ eventDate, reason }),
    summarize: jest.fn(),
  };
}

function makeInput(overrides: Partial<DetectCriticalInput> = {}): DetectCriticalInput {
  return {
    candidates: [makeCandidate()],
    careThreshold: CARE_THRESHOLD,
    llmClient: makeLlmClient(NEAR_FUTURE_DATE),
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AND ゲートテスト
// ---------------------------------------------------------------------------

describe('detectCriticalTopic - AND ゲート', () => {
  it('高 care AND 時限性 → critical', async () => {
    const result = await detectCriticalTopic(makeInput());
    expect(result.isCritical).toBe(true);
    expect(result.topicId).toBe('t1');
    expect(result.factId).toBe('f1');
  });

  it('高 care あり AND 時限性なし（eventDate=null）→ 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient(null) }));
    expect(result.isCritical).toBe(false);
    expect(result.topicId).toBeNull();
    expect(result.factId).toBeNull();
  });

  it('care が閾値未満 → LLM を呼ばず非 critical', async () => {
    const llmClient = makeLlmClient(NEAR_FUTURE_DATE);
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD - 1 })],
        llmClient,
      })
    );
    expect(result.isCritical).toBe(false);
    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('どちらも無し（care 閾値未満＋ eventDate=null）→ 非 critical', async () => {
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD - 1 })],
        llmClient: makeLlmClient(null),
      })
    );
    expect(result.isCritical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// care 閾値境界テスト
// ---------------------------------------------------------------------------

describe('detectCriticalTopic - care 閾値境界', () => {
  it(`care が閾値（${CARE_THRESHOLD}）以上 → isHighCare=true → critical になりうる`, async () => {
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD })],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(true);
  });

  it('care が閾値未満（閾値-1）→ isHighCare=false → 非 critical', async () => {
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD - 1 })],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(false);
  });

  it('care が閾値を大きく上回る → critical になりうる', async () => {
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD + 10 })],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// eventDate ホライズン判定テスト
// ---------------------------------------------------------------------------

describe('detectCriticalTopic - eventDate ホライズン', () => {
  it('近未来（今日 + 5 日）→ isUrgent=true → critical', async () => {
    const result = await detectCriticalTopic(
      makeInput({ llmClient: makeLlmClient(NEAR_FUTURE_DATE) })
    );
    expect(result.isCritical).toBe(true);
  });

  it('遠未来（今日 + 20 日 → horizon 超過）→ isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalTopic(
      makeInput({ llmClient: makeLlmClient(FAR_FUTURE_DATE) })
    );
    expect(result.isCritical).toBe(false);
  });

  it('過去日 → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient(PAST_DATE) }));
    expect(result.isCritical).toBe(false);
  });

  it('eventDate=null → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient(null) }));
    expect(result.isCritical).toBe(false);
  });

  it('解析不能な日付文字列 → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient('不明な日付') }));
    expect(result.isCritical).toBe(false);
  });

  it(`ホライズン境界（今日 + ${NOTIFY_CRITICAL_EVENT_HORIZON_DAYS} 日）→ isUrgent=true → critical`, async () => {
    const result = await detectCriticalTopic(
      makeInput({ llmClient: makeLlmClient(HORIZON_BOUNDARY) })
    );
    expect(result.isCritical).toBe(true);
  });

  it('ホライズン境界翌日（超過）→ isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient(OVER_HORIZON) }));
    expect(result.isCritical).toBe(false);
  });

  it('今日と同じ日付 → isUrgent=true（当日含む）→ critical', async () => {
    const todayStr = '2026-06-07'; // NOW と同じ
    const result = await detectCriticalTopic(makeInput({ llmClient: makeLlmClient(todayStr) }));
    expect(result.isCritical).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// エラーハンドリングテスト（best-effort）
// ---------------------------------------------------------------------------

describe('detectCriticalTopic - エラーハンドリング', () => {
  it('LLM が throw しても落ちず次の候補へ進む', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest
        .fn()
        .mockRejectedValueOnce(new Error('LLM タイムアウト'))
        .mockResolvedValueOnce({ eventDate: NEAR_FUTURE_DATE, reason: '成功' }),
      summarize: jest.fn(),
    };

    const candidates = [
      makeCandidate({ TopicID: 't1', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't1', FactID: 'f1' }),
      ]),
      makeCandidate({ TopicID: 't2', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't2', FactID: 'f2' }),
      ]),
    ];

    const result = await detectCriticalTopic(makeInput({ candidates, llmClient }));

    // t1 は LLM エラーだがスキップ、t2 は成功してクリティカルになる
    expect(result.isCritical).toBe(true);
    expect(result.topicId).toBe('t2');
    expect(result.factId).toBe('f2');
  });

  it('全候補が LLM エラーでも { isCritical: false, topicId: null, factId: null } を返す', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest.fn().mockRejectedValue(new Error('全部失敗')),
      summarize: jest.fn(),
    };

    const result = await detectCriticalTopic(makeInput({ llmClient }));
    expect(result).toEqual({ isCritical: false, topicId: null, factId: null });
  });
});

// ---------------------------------------------------------------------------
// 複数 Topic: 最初の 1 件のみ返すテスト
// ---------------------------------------------------------------------------

describe('detectCriticalTopic - 複数 Topic', () => {
  it('複数の候補があっても最初の critical を返す', async () => {
    const candidates = [
      makeCandidate({ TopicID: 't1', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't1', FactID: 'f1' }),
      ]),
      makeCandidate({ TopicID: 't2', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't2', FactID: 'f2' }),
      ]),
    ];

    const result = await detectCriticalTopic(
      makeInput({ candidates, llmClient: makeLlmClient(NEAR_FUTURE_DATE) })
    );

    expect(result.isCritical).toBe(true);
    expect(result.topicId).toBe('t1'); // 最初の候補
  });

  it('最初の候補が非 critical で次が critical → 次の候補を返す', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest
        .fn()
        .mockResolvedValueOnce({ eventDate: null, reason: 't1 は時限性なし' })
        .mockResolvedValueOnce({ eventDate: NEAR_FUTURE_DATE, reason: 't2 は時限性あり' }),
      summarize: jest.fn(),
    };

    const candidates = [
      makeCandidate({ TopicID: 't1', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't1', FactID: 'f1' }),
      ]),
      makeCandidate({ TopicID: 't2', Care: CARE_THRESHOLD }, [
        makeWebFact({ TopicID: 't2', FactID: 'f2' }),
      ]),
    ];

    const result = await detectCriticalTopic(makeInput({ candidates, llmClient }));

    expect(result.isCritical).toBe(true);
    expect(result.topicId).toBe('t2');
  });

  it('candidates が空 → 非 critical', async () => {
    const result = await detectCriticalTopic(makeInput({ candidates: [] }));
    expect(result).toEqual({ isCritical: false, topicId: null, factId: null });
  });

  it('Topic 配下の webFacts が空 → LLM を呼ばず非 critical', async () => {
    const llmClient = makeLlmClient(NEAR_FUTURE_DATE);
    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD }, [])],
        llmClient,
      })
    );
    expect(result.isCritical).toBe(false);
    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('WEB fact は ObservedAt 降順で最新のものから評価する', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest.fn().mockResolvedValue({ eventDate: NEAR_FUTURE_DATE, reason: 'ok' }),
      summarize: jest.fn(),
    };

    const olderFact = makeWebFact({ FactID: 'f-old', ObservedAt: 1000 });
    const newerFact = makeWebFact({ FactID: 'f-new', ObservedAt: 5000 });

    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD }, [olderFact, newerFact])],
        llmClient,
      })
    );

    // 最初に urgent と判定されるのは ObservedAt 最新の newerFact
    expect(result.isCritical).toBe(true);
    expect(result.factId).toBe('f-new');
  });

  it('WEB fact が ESCALATION_RECENT_WEB_FACTS_LIMIT(3) 件を超える場合、4 件目以降は評価されない', async () => {
    const llmClient = makeLlmClient(null);

    // 4 件の WEB fact。最も古い fact（4 件目 = ObservedAt 最小）にのみ緊急日付を仕込むが、
    // ObservedAt 降順で上位 3 件しか評価対象に入らないため critical にはならないはず
    const facts = [
      makeWebFact({ FactID: 'f1', ObservedAt: 4000 }),
      makeWebFact({ FactID: 'f2', ObservedAt: 3000 }),
      makeWebFact({ FactID: 'f3', ObservedAt: 2000 }),
      makeWebFact({ FactID: 'f4-oldest', ObservedAt: 1000 }),
    ];

    // LLM は基本 eventDate=null を返すが、f4-oldest だけが評価されたら urgent になるよう
    // 個別に呼び出し引数から判定する
    const chatStructured = jest.fn().mockImplementation((messages: Array<{ content: string }>) => {
      const userMessage = messages.find((m) => m.content.includes('内容:'));
      if (userMessage?.content.includes('f4-oldest 用テキスト')) {
        return Promise.resolve({ eventDate: NEAR_FUTURE_DATE, reason: '緊急' });
      }
      return Promise.resolve({ eventDate: null, reason: '緊急でない' });
    });
    llmClient.chatStructured = chatStructured as unknown as ILLMClient['chatStructured'];

    const factsWithMarker = facts.map((f) =>
      f.FactID === 'f4-oldest' ? { ...f, Text: 'f4-oldest 用テキスト' } : f
    );

    const result = await detectCriticalTopic(
      makeInput({
        candidates: [makeCandidate({ Care: CARE_THRESHOLD }, factsWithMarker)],
        llmClient,
      })
    );

    // 4 件目（最古）は評価対象外のため非 critical
    expect(result.isCritical).toBe(false);
    expect(result.factId).toBeNull();
    // LLM 呼び出しは上位 3 件分のみ（ESCALATION_RECENT_WEB_FACTS_LIMIT）
    expect(chatStructured).toHaveBeenCalledTimes(3);
  });
});
