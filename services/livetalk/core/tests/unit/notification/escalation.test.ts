import { detectCriticalKnowledge } from '../../../src/notification/escalation.js';
import type { DetectCriticalInput } from '../../../src/notification/escalation.js';
import type { KnowledgeEntity } from '../../../src/entities/knowledge.entity.js';
import type { InterestCategoryEntity } from '../../../src/entities/interest-category.entity.js';
import type { ILLMClient, IEmbeddingClient } from '../../../src/llm-client/types.js';
import {
  NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD,
  NOTIFY_CRITICAL_EVENT_HORIZON_DAYS,
} from '../../../src/constants.js';

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

function makeKnowledge(overrides: Partial<KnowledgeEntity> = {}): KnowledgeEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    KnowledgeID: 'k1',
    Topic: 'テストトピック',
    Summary: 'テスト要約',
    SourceUrls: [],
    RawComment: 'コメント',
    RelatedCategory: 'ゲーム',
    CreatedAt: 1000,
    UpdatedAt: 1000,
    ...overrides,
  };
}

function makeInterestCategory(
  category: string,
  weight: number,
  embedding?: number[]
): InterestCategoryEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    Category: category,
    Weight: weight,
    Embedding: embedding,
    CreatedAt: 0,
    UpdatedAt: 0,
  };
}

function makeLlmClient(eventDate: string | null, reason = '判定理由'): ILLMClient {
  return {
    chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
    chatComplete: jest.fn(),
    chatStructured: jest.fn().mockResolvedValue({ eventDate, reason }),
    summarize: jest.fn(),
  };
}

function makeEmbeddingClient(vectors: Map<string, number[]> = new Map()): IEmbeddingClient {
  return {
    embed: jest.fn().mockImplementation((text: string) => {
      const vec = vectors.get(text);
      if (vec) return Promise.resolve(vec);
      // 未登録テキストはゼロベクトル（類似度 0）
      return Promise.resolve([0, 0, 0]);
    }),
  };
}

function makeInput(overrides: Partial<DetectCriticalInput> = {}): DetectCriticalInput {
  return {
    knowledgeList: [makeKnowledge()],
    interestCategories: [makeInterestCategory('ゲーム', 1.0)],
    llmClient: makeLlmClient(NEAR_FUTURE_DATE),
    embeddingClient: makeEmbeddingClient(),
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AND ゲートテスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - AND ゲート', () => {
  it('強関心 AND 時限性 → critical', async () => {
    const result = await detectCriticalKnowledge(makeInput());
    expect(result.isCritical).toBe(true);
    expect(result.knowledgeId).toBe('k1');
  });

  it('強関心あり AND 時限性なし（eventDate=null）→ 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(null) })
    );
    expect(result.isCritical).toBe(false);
    expect(result.knowledgeId).toBeNull();
  });

  it('強関心なし（シェア不足）→ LLM を呼ばず非 critical', async () => {
    // ゲーム=0.1, 合計=1.0 → シェア0.1 < NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD(0.15)
    const llmClient = makeLlmClient(NEAR_FUTURE_DATE);
    const result = await detectCriticalKnowledge(
      makeInput({
        interestCategories: [makeInterestCategory('ゲーム', 0.1), makeInterestCategory('映画', 0.9)],
        llmClient,
      })
    );
    expect(result.isCritical).toBe(false);
    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('どちらも無し（関心なし＋ eventDate=null）→ 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({
        interestCategories: [makeInterestCategory('映画', 0.9), makeInterestCategory('音楽', 0.1)],
        llmClient: makeLlmClient(null),
      })
    );
    expect(result.isCritical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RelatedCategory 解決テスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - RelatedCategory 解決', () => {
  it('完全一致するカテゴリで解決 → critical になる', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList: [makeKnowledge({ RelatedCategory: 'ゲーム' })],
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(true);
  });

  it('embedding 類似度が閾値以上 → 解決成功 → critical になる', async () => {
    // 'テレビゲーム' と 'ゲーム' の embedding が類似（cosine similarity >= 0.85）を模擬
    // ベクトルを一致させて cosine=1.0 にする
    const vec = [1, 0, 0];
    const vectors = new Map<string, number[]>([
      ['テレビゲーム', vec],
      ['ゲーム', vec],
    ]);

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList: [makeKnowledge({ RelatedCategory: 'テレビゲーム' })],
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        embeddingClient: makeEmbeddingClient(vectors),
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(true);
  });

  it('embedding 類似度が閾値未満 → 解決失敗 → 非 critical', async () => {
    // 直交ベクトルで cosine=0.0 → 閾値 0.85 を下回る
    const vectors = new Map<string, number[]>([
      ['テレビゲーム', [1, 0, 0]],
      ['ゲーム', [0, 1, 0]],
    ]);

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList: [makeKnowledge({ RelatedCategory: 'テレビゲーム' })],
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        embeddingClient: makeEmbeddingClient(vectors),
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(false);
  });

  it('interestCategories が空 → 解決不可 → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ interestCategories: [] })
    );
    expect(result.isCritical).toBe(false);
  });

  it('カテゴリ entity に Embedding がある場合は embed を呼ばず使用する', async () => {
    const existingEmbedding = [1, 0, 0];
    const relatedVec = [1, 0, 0]; // cosine=1.0 → 閾値以上
    const vectors = new Map<string, number[]>([['テレビゲーム', relatedVec]]);
    const embeddingClient = makeEmbeddingClient(vectors);

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList: [makeKnowledge({ RelatedCategory: 'テレビゲーム' })],
        interestCategories: [makeInterestCategory('ゲーム', 1.0, existingEmbedding)],
        embeddingClient,
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );

    expect(result.isCritical).toBe(true);
    // カテゴリ側の embed は呼ばれないはず（entity.Embedding を使用）
    expect((embeddingClient.embed as jest.Mock).mock.calls.map((c) => c[0])).not.toContain('ゲーム');
  });
});

// ---------------------------------------------------------------------------
// シェア閾値境界テスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - シェア閾値境界', () => {
  it(`シェアが閾値（${NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD}）以上 → isStrongInterest=true → critical になりうる`, async () => {
    // ゲーム=0.15, 合計=1.0 → シェア=0.15 = 閾値（境界値、以上なので true）
    const result = await detectCriticalKnowledge(
      makeInput({
        interestCategories: [
          makeInterestCategory('ゲーム', NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD),
          makeInterestCategory('映画', 1 - NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD),
        ],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(true);
  });

  it('シェアが閾値未満 → isStrongInterest=false → 非 critical', async () => {
    // シェア = 0.14 < 0.15
    const gameWeight = 0.14;
    const otherWeight = 1 - gameWeight;
    const result = await detectCriticalKnowledge(
      makeInput({
        interestCategories: [
          makeInterestCategory('ゲーム', gameWeight),
          makeInterestCategory('映画', otherWeight),
        ],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );
    expect(result.isCritical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// eventDate ホライズン判定テスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - eventDate ホライズン', () => {
  it('近未来（今日 + 5 日）→ isUrgent=true → critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(NEAR_FUTURE_DATE) })
    );
    expect(result.isCritical).toBe(true);
  });

  it('遠未来（今日 + 20 日 → horizon 超過）→ isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(FAR_FUTURE_DATE) })
    );
    expect(result.isCritical).toBe(false);
  });

  it('過去日 → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(PAST_DATE) })
    );
    expect(result.isCritical).toBe(false);
  });

  it('eventDate=null → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(null) })
    );
    expect(result.isCritical).toBe(false);
  });

  it('解析不能な日付文字列 → isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient('不明な日付') })
    );
    expect(result.isCritical).toBe(false);
  });

  it(`ホライズン境界（今日 + ${NOTIFY_CRITICAL_EVENT_HORIZON_DAYS} 日）→ isUrgent=true → critical`, async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(HORIZON_BOUNDARY) })
    );
    expect(result.isCritical).toBe(true);
  });

  it('ホライズン境界翌日（超過）→ isUrgent=false → 非 critical', async () => {
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(OVER_HORIZON) })
    );
    expect(result.isCritical).toBe(false);
  });

  it('今日と同じ日付 → isUrgent=true（当日含む）→ critical', async () => {
    const todayStr = '2026-06-07'; // NOW と同じ
    const result = await detectCriticalKnowledge(
      makeInput({ llmClient: makeLlmClient(todayStr) })
    );
    expect(result.isCritical).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// エラーハンドリングテスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - エラーハンドリング', () => {
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

    const knowledgeList = [
      makeKnowledge({ KnowledgeID: 'k1', RelatedCategory: 'ゲーム' }),
      makeKnowledge({ KnowledgeID: 'k2', RelatedCategory: 'ゲーム' }),
    ];

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList,
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        llmClient,
      })
    );

    // k1 は LLM エラーだがスキップ、k2 は成功してクリティカルになる
    expect(result.isCritical).toBe(true);
    expect(result.knowledgeId).toBe('k2');
  });

  it('embedding が throw しても落ちず次の候補へ進む', async () => {
    const embeddingClient: IEmbeddingClient = {
      embed: jest
        .fn()
        .mockRejectedValueOnce(new Error('embedding エラー'))
        .mockResolvedValue([1, 0, 0]),
    };

    const knowledgeList = [
      makeKnowledge({ KnowledgeID: 'k1', RelatedCategory: '未知カテゴリ' }),
      makeKnowledge({ KnowledgeID: 'k2', RelatedCategory: 'ゲーム' }),
    ];

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList,
        // ゲームカテゴリに embedding なし（embed を呼ぶ）
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        embeddingClient,
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );

    // k1 は embedding エラーでスキップ、k2（完全一致）は成功する
    // ※ k2 は '未知カテゴリ' → 'ゲーム' への embed で失敗するが、
    //    k1 の embed 失敗後はキャッシュがないため k2 でも embed が呼ばれる
    // 実際の挙動: k1 で embed('未知カテゴリ') が throw → catch して次へ
    //           k2 の '未知カテゴリ' は k2 自体の RelatedCategory='ゲーム'
    //           k2 は完全一致 → embed 不要 → critical
    // 注: k1 は '未知カテゴリ' → ゲームカテゴリへの embed 解決で失敗する
    //     k2 は 'ゲーム' → 完全一致で embed 不要 → critical
    expect(result.isCritical).toBe(true);
  });

  it('全 Knowledge が LLM エラーでも { isCritical: false, knowledgeId: null } を返す', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest.fn().mockRejectedValue(new Error('全部失敗')),
      summarize: jest.fn(),
    };

    const result = await detectCriticalKnowledge(makeInput({ llmClient }));
    expect(result).toEqual({ isCritical: false, knowledgeId: null });
  });
});

// ---------------------------------------------------------------------------
// 複数 Knowledge: 最初の 1 件のみ返すテスト
// ---------------------------------------------------------------------------

describe('detectCriticalKnowledge - 複数 Knowledge', () => {
  it('複数の候補があっても最初の critical を返す', async () => {
    const knowledgeList = [
      makeKnowledge({ KnowledgeID: 'k1', RelatedCategory: 'ゲーム' }),
      makeKnowledge({ KnowledgeID: 'k2', RelatedCategory: 'ゲーム' }),
    ];

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList,
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        llmClient: makeLlmClient(NEAR_FUTURE_DATE),
      })
    );

    expect(result.isCritical).toBe(true);
    expect(result.knowledgeId).toBe('k1'); // 最初の候補
  });

  it('最初の候補が非 critical で次が critical → 次の候補を返す', async () => {
    const llmClient: ILLMClient = {
      chatStream: jest.fn() as unknown as ILLMClient['chatStream'],
      chatComplete: jest.fn(),
      chatStructured: jest
        .fn()
        .mockResolvedValueOnce({ eventDate: null, reason: 'k1 は時限性なし' })
        .mockResolvedValueOnce({ eventDate: NEAR_FUTURE_DATE, reason: 'k2 は時限性あり' }),
      summarize: jest.fn(),
    };

    const knowledgeList = [
      makeKnowledge({ KnowledgeID: 'k1', RelatedCategory: 'ゲーム' }),
      makeKnowledge({ KnowledgeID: 'k2', RelatedCategory: 'ゲーム' }),
    ];

    const result = await detectCriticalKnowledge(
      makeInput({
        knowledgeList,
        interestCategories: [makeInterestCategory('ゲーム', 1.0)],
        llmClient,
      })
    );

    expect(result.isCritical).toBe(true);
    expect(result.knowledgeId).toBe('k2');
  });

  it('knowledgeList が空 → 非 critical', async () => {
    const result = await detectCriticalKnowledge(makeInput({ knowledgeList: [] }));
    expect(result).toEqual({ isCritical: false, knowledgeId: null });
  });
});
