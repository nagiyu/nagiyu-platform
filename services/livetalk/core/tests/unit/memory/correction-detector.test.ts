import { detectCorrection } from '../../../src/memory/correction-detector.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { RetrievedMemory } from '../../../src/memory/types.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';

const FIXED_NOW = 1_750_000_000_000;

function makeMemory(id: string, content: string): MemoryEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MemoryID: id,
    Tier: 'B',
    Category: 'food',
    Content: content,
    Confidence: 0.8,
    ReferencedCount: 3,
    LastReferencedAt: FIXED_NOW - 10000,
    CreatedAt: FIXED_NOW - 100000,
    UpdatedAt: FIXED_NOW - 10000,
  };
}

function makeRetrieved(id: string, content: string): RetrievedMemory {
  return { memory: makeMemory(id, content), similarity: 0.9 };
}

function makeLLMClient(response: string): ILLMClient {
  return {
    chatStream: jest.fn(),
    chatComplete: jest.fn(async () => response),
    summarize: jest.fn(),
  } as unknown as ILLMClient;
}

describe('detectCorrection', () => {
  const prevMsg = 'コーヒーが好きなんだね！わかった。';
  const memories = [makeRetrieved('m1', 'コーヒーが好き')];

  describe('キーワード検出（高速フィルタ）', () => {
    it('訂正キーワードがなければ LLM を呼ばずに detected: false を返す', async () => {
      const llm = makeLLMClient('');
      const result = await detectCorrection('そうだよ！', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(result.targetMemories).toHaveLength(0);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });

    it('取得した Memory が空なら detected: false を返す（キーワードありでも）', async () => {
      const llm = makeLLMClient('');
      const result = await detectCorrection('違う！', prevMsg, [], llm);
      expect(result.detected).toBe(false);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });

    it('空入力は detected: false を返す', async () => {
      const llm = makeLLMClient('');
      const result = await detectCorrection('', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });
  });

  describe('追加情報パターン除外（false positive 抑制）', () => {
    it('「いや、それも好きだよ」は訂正と検出しない', async () => {
      const llm = makeLLMClient('{"detected": true, "targetMemoryIds": ["m1"]}');
      const result = await detectCorrection('いや、コーヒーも好きだよ', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });

    it('「違う、どちらも好き」は訂正と検出しない', async () => {
      const llm = makeLLMClient('{"detected": true, "targetMemoryIds": ["m1"]}');
      const result = await detectCorrection('違う、どちらも好き！', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });

    it('「実は、コーヒーもお茶も好き」は訂正と検出しない', async () => {
      const llm = makeLLMClient('{"detected": true, "targetMemoryIds": ["m1"]}');
      const result = await detectCorrection(
        '実は、コーヒーもお茶も好きなんだ',
        prevMsg,
        memories,
        llm
      );
      expect(result.detected).toBe(false);
      expect(llm.chatComplete).not.toHaveBeenCalled();
    });
  });

  describe('LLM 最終判定', () => {
    it('LLM が detected: true を返せば訂正を検出する', async () => {
      const llm = makeLLMClient(
        '{"detected": true, "targetMemoryIds": ["m1"], "newValue": "お茶が好き"}'
      );
      const result = await detectCorrection('違う、お茶が好きなんだ', prevMsg, memories, llm);
      expect(result.detected).toBe(true);
      expect(result.targetMemories).toHaveLength(1);
      expect(result.targetMemories[0].MemoryID).toBe('m1');
      expect(result.newValue).toBe('お茶が好き');
    });

    it('LLM が detected: false を返せば検出しない', async () => {
      const llm = makeLLMClient('{"detected": false}');
      const result = await detectCorrection('いや、まあそうだね', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(result.targetMemories).toHaveLength(0);
    });

    it('LLM が存在しない memoryId を返しても targetMemories は空', async () => {
      const llm = makeLLMClient('{"detected": true, "targetMemoryIds": ["nonexistent"]}');
      const result = await detectCorrection('違う！', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
      expect(result.targetMemories).toHaveLength(0);
    });

    it('LLM がエラーを投げても detected: false で継続する（fail-warn）', async () => {
      const llm = {
        chatStream: jest.fn(),
        chatComplete: jest.fn(async () => {
          throw new Error('API error');
        }),
        summarize: jest.fn(),
      } as unknown as ILLMClient;
      const result = await detectCorrection('違う！', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
    });

    it('LLM が不正 JSON を返しても detected: false で継続する', async () => {
      const llm = makeLLMClient('invalid json');
      const result = await detectCorrection('違う！', prevMsg, memories, llm);
      expect(result.detected).toBe(false);
    });

    it('LLM がコードブロック付き JSON を返しても正しくパースする', async () => {
      const llm = makeLLMClient('```json\n{"detected": true, "targetMemoryIds": ["m1"]}\n```');
      const result = await detectCorrection('違う！', prevMsg, memories, llm);
      expect(result.detected).toBe(true);
    });

    it('複数の訂正対象を返す場合、全て targetMemories に含まれる', async () => {
      const multiMemories = [
        makeRetrieved('m1', 'コーヒーが好き'),
        makeRetrieved('m2', '趣味はゲーム'),
      ];
      const llm = makeLLMClient('{"detected": true, "targetMemoryIds": ["m1", "m2"]}');
      const result = await detectCorrection(
        '実は違う、お茶が好きで趣味は読書なんだ',
        prevMsg,
        multiMemories,
        llm
      );
      expect(result.detected).toBe(true);
      expect(result.targetMemories).toHaveLength(2);
    });
  });

  describe('訂正キーワードバリエーション', () => {
    it.each([
      ['違う、お茶が好き'],
      ['ちがう、お茶が好き'],
      ['実は猫アレルギーなんだ'],
      ['やっぱり、違う'],
      ['そうじゃない！'],
      ['あれ、間違えた'],
    ])('「%s」はキーワード検出を通過して LLM まで到達する', async (input) => {
      const llm = makeLLMClient('{"detected": false}');
      await detectCorrection(input, prevMsg, memories, llm);
      expect(llm.chatComplete).toHaveBeenCalled();
    });

    it.each([['そうだよ'], ['うん、コーヒー好き'], ['ありがとう！'], ['もっと教えて']])(
      '「%s」はキーワード検出で LLM を呼ばない',
      async (input) => {
        const llm = makeLLMClient('');
        await detectCorrection(input, prevMsg, memories, llm);
        expect(llm.chatComplete).not.toHaveBeenCalled();
      }
    );
  });
});
