import {
  identifyPromotionCandidates,
  identifyNewLearnings,
} from '../../../src/memory/confirmation.js';
import type { IEmbeddingClient, ILLMClient } from '../../../src/llm-client/types.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';
import {
  CONFIRMATION_COOLDOWN_MS,
  PROMOTION_SIMILARITY_THRESHOLD,
} from '../../../src/constants.js';

const FIXED_NOW = 1_750_000_000_000;

function makeMemoryC(id: string, content: string, embedding?: number[]): MemoryEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MemoryID: id,
    Tier: 'C',
    Category: 'food',
    Content: content,
    Confidence: 0.5,
    ReferencedCount: 1,
    CreatedAt: FIXED_NOW - 100000,
    UpdatedAt: FIXED_NOW - 100000,
    Embedding: embedding,
  };
}

function makeMemoryRepo(tierC: MemoryEntity[]): MemoryRepository {
  return {
    listByTier: jest.fn(async (_u, _c, tier) => (tier === 'C' ? { items: tierC } : { items: [] })),
    put: jest.fn(),
    get: jest.fn(),
    listByCategory: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    promote: jest.fn(),
    demote: jest.fn(),
  } as unknown as MemoryRepository;
}

function makeEmbeddingClient(vec: number[]): IEmbeddingClient {
  return { embed: jest.fn(async () => vec) };
}

function makeLLMClient(response: object): ILLMClient {
  return {
    chatStream: jest.fn(),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(async () => response),
    summarize: jest.fn(),
  } as unknown as ILLMClient;
}

// テスト用ベクトル（直交）
const VEC_COFFEE = [1, 0, 0];
const VEC_SPORTS = [0, 1, 0];
const VEC_QUERY_COFFEE = [0.99, 0.1, 0]; // coffee に近い

describe('identifyPromotionCandidates', () => {
  describe('Tier C 記憶なし', () => {
    it('Tier C が空なら空配列を返す', async () => {
      const repo = makeMemoryRepo([]);
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒーが好き',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        makeLLMClient({ promotions: [] })
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('embedding 未設定', () => {
    it('embedding がない Tier C 記憶はスキップする', async () => {
      const mem = makeMemoryC('c1', 'コーヒーが好き'); // embedding なし
      const repo = makeMemoryRepo([mem]);
      const llm = makeLLMClient({ promotions: [] });
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒー飲んだ',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        llm
      );
      expect(result).toHaveLength(0);
      expect(llm.chatStructured).not.toHaveBeenCalled();
    });
  });

  describe('similarity 閾値', () => {
    it(`similarity >= ${PROMOTION_SIMILARITY_THRESHOLD} の場合のみ LLM 判定に進む`, async () => {
      const highSim = makeMemoryC('c1', 'コーヒーが好き', VEC_COFFEE); // coffee に近い
      const lowSim = makeMemoryC('c2', 'スポーツが好き', VEC_SPORTS); // 直交
      const repo = makeMemoryRepo([highSim, lowSim]);
      const llm = makeLLMClient({ promotions: [{ memoryId: 'c1', promote: true }] });
      await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒー飲んだ',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        llm
      );
      const [, promptArg] = (llm.chatStructured as jest.Mock).mock.calls[0];
      // LLM に渡したメッセージに c2 が含まれていないことを確認
      expect(JSON.stringify(promptArg ?? '')).not.toContain('c2');
    });
  });

  describe('LLM 昇格判定', () => {
    it('LLM が promote: true を返した Memory を返す', async () => {
      const mem = makeMemoryC('c1', 'コーヒーが好き', VEC_COFFEE);
      const repo = makeMemoryRepo([mem]);
      const llm = makeLLMClient({ promotions: [{ memoryId: 'c1', promote: true }] });
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒーの話',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        llm
      );
      expect(result).toHaveLength(1);
      expect(result[0].MemoryID).toBe('c1');
    });

    it('LLM が promote: false を返した Memory は含まない', async () => {
      const mem = makeMemoryC('c1', 'コーヒーが好き', VEC_COFFEE);
      const repo = makeMemoryRepo([mem]);
      const llm = makeLLMClient({ promotions: [{ memoryId: 'c1', promote: false }] });
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒーの話',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        llm
      );
      expect(result).toHaveLength(0);
    });

    it('LLM がエラーを投げても空配列で継続する（fail-warn）', async () => {
      const mem = makeMemoryC('c1', 'コーヒーが好き', VEC_COFFEE);
      const repo = makeMemoryRepo([mem]);
      const llm = {
        chatStream: jest.fn(),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => {
          throw new Error('API error');
        }),
        summarize: jest.fn(),
      } as unknown as ILLMClient;
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒーの話',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        llm
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('Tier C 取得がエラーなら空配列で継続する', async () => {
      const repo = {
        ...makeMemoryRepo([]),
        listByTier: jest.fn(async () => {
          throw new Error('DynamoDB error');
        }),
      } as unknown as MemoryRepository;
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒー',
        repo,
        makeEmbeddingClient(VEC_QUERY_COFFEE),
        makeLLMClient({ promotions: [] })
      );
      expect(result).toHaveLength(0);
    });

    it('embedding 生成がエラーなら空配列で継続する', async () => {
      const mem = makeMemoryC('c1', 'コーヒーが好き', VEC_COFFEE);
      const repo = makeMemoryRepo([mem]);
      const failingEmbed: IEmbeddingClient = {
        embed: jest.fn(async () => {
          throw new Error('embed error');
        }),
      };
      const result = await identifyPromotionCandidates(
        'u1',
        'hiyori',
        'コーヒー',
        repo,
        failingEmbed,
        makeLLMClient({ promotions: [] })
      );
      expect(result).toHaveLength(0);
    });
  });
});

describe('identifyNewLearnings', () => {
  function makeCandidate(id: string, lastReferencedAt?: number): MemoryEntity {
    return makeMemoryC(id, `content ${id}`, VEC_COFFEE, lastReferencedAt);
  }

  function makeMemoryC(id: string, content: string, _: number[], lastRef?: number): MemoryEntity {
    return {
      UserID: 'u1',
      CharacterID: 'hiyori',
      MemoryID: id,
      Tier: 'C',
      Category: 'food',
      Content: content,
      Confidence: 0.5,
      ReferencedCount: 1,
      LastReferencedAt: lastRef,
      CreatedAt: FIXED_NOW - 100000,
      UpdatedAt: FIXED_NOW - 100000,
    };
  }

  it('空配列を渡すと空配列を返す', () => {
    expect(identifyNewLearnings([], FIXED_NOW)).toHaveLength(0);
  });

  it('LastReferencedAt が未設定の記憶は含める（初回参照）', () => {
    const m = makeCandidate('c1', undefined);
    const result = identifyNewLearnings([m], FIXED_NOW);
    expect(result).toHaveLength(1);
  });

  it(`直近 ${CONFIRMATION_COOLDOWN_MS}ms 以内に参照済みの記憶は除外する`, () => {
    const m = makeCandidate('c1', FIXED_NOW - CONFIRMATION_COOLDOWN_MS + 1000); // cooldown 内
    const result = identifyNewLearnings([m], FIXED_NOW);
    expect(result).toHaveLength(0);
  });

  it(`cooldown 以上経過していれば含める`, () => {
    const m = makeCandidate('c1', FIXED_NOW - CONFIRMATION_COOLDOWN_MS - 1); // cooldown 超過
    const result = identifyNewLearnings([m], FIXED_NOW);
    expect(result).toHaveLength(1);
  });

  it('cooldown 内のものと外のものが混在する場合、外のもののみ返す', () => {
    const recent = makeCandidate('c1', FIXED_NOW - 1000); // cooldown 内
    const old = makeCandidate('c2', FIXED_NOW - CONFIRMATION_COOLDOWN_MS * 2); // cooldown 超過
    const fresh = makeCandidate('c3', undefined); // 未参照
    const result = identifyNewLearnings([recent, old, fresh], FIXED_NOW);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.MemoryID).sort()).toEqual(['c2', 'c3']);
  });
});
