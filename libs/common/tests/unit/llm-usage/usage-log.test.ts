import { logger } from '../../../src/logger/logger.js';
import {
  extractOpenAIResponsesUsage,
  resolveOpenAIResponsesOutcome,
  logLLMUsage,
  LLM_USAGE_LOG_MESSAGE,
  LLM_USAGE_WARN_MESSAGES,
} from '../../../src/llm-usage/usage-log.js';

describe('extractOpenAIResponsesUsage', () => {
  it('OpenAI Responses API の usage 形式から各トークン数を抽出する', () => {
    const usage = {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
      output_tokens: 50,
      output_tokens_details: { reasoning_tokens: 30 },
      total_tokens: 150,
    };

    expect(extractOpenAIResponsesUsage(usage)).toEqual({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 30,
      totalTokens: 150,
    });
  });

  it('null が渡されても throw せず全フィールド undefined を返す', () => {
    expect(extractOpenAIResponsesUsage(null)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('undefined が渡されても throw しない', () => {
    expect(() => extractOpenAIResponsesUsage(undefined)).not.toThrow();
    expect(extractOpenAIResponsesUsage(undefined)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('数値でない・想定外の型が来ても throw せず undefined として扱う', () => {
    expect(() => extractOpenAIResponsesUsage('unexpected string')).not.toThrow();
    expect(() => extractOpenAIResponsesUsage(123)).not.toThrow();
    expect(() => extractOpenAIResponsesUsage(['a', 'b'])).not.toThrow();
    expect(extractOpenAIResponsesUsage('unexpected string')).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('details が欠損していても throw せず該当フィールドのみ undefined になる', () => {
    const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };

    expect(extractOpenAIResponsesUsage(usage)).toEqual({
      inputTokens: 10,
      cachedInputTokens: undefined,
      outputTokens: 5,
      reasoningTokens: undefined,
      totalTokens: 15,
    });
  });

  it('input_tokens が数値でない場合は undefined になる', () => {
    const usage = { input_tokens: '100', output_tokens: 5 };

    expect(extractOpenAIResponsesUsage(usage)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: 5,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('Embeddings API 形式（prompt_tokens / total_tokens）を渡すと inputTokens 等は取得できない（誤用時に静かに壊れることの確認）', () => {
    // Embeddings API は input_tokens ではなく prompt_tokens を使うため読めない。
    // total_tokens だけはフィールド名が偶然一致するため拾えてしまうが、
    // Responses API 固有の inputTokens / outputTokens 等は取得できない。
    const embeddingsUsage = { prompt_tokens: 10, total_tokens: 10 };

    expect(extractOpenAIResponsesUsage(embeddingsUsage)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: 10,
    });
  });
});

describe('resolveOpenAIResponsesOutcome', () => {
  it.each(['completed', 'incomplete', 'failed'] as const)(
    'status=%s はそのまま outcome として返す',
    (status) => {
      expect(resolveOpenAIResponsesOutcome(status)).toBe(status);
    }
  );

  it('想定外の status（in_progress 等）は undefined を返す', () => {
    expect(resolveOpenAIResponsesOutcome('in_progress')).toBeUndefined();
  });

  it('文字列でない値・undefined は undefined を返す', () => {
    expect(resolveOpenAIResponsesOutcome(undefined)).toBeUndefined();
    expect(resolveOpenAIResponsesOutcome(null)).toBeUndefined();
    expect(resolveOpenAIResponsesOutcome(123)).toBeUndefined();
  });

  it('aborted は変換結果として返らない（ストリーミング中断専用の値のため）', () => {
    expect(resolveOpenAIResponsesOutcome('aborted')).toBeUndefined();
  });
});

describe('logLLMUsage', () => {
  it('logger.info を LLM_USAGE_LOG_MESSAGE とフラットな context で呼び出す', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    logLLMUsage({
      service: 'livetalk',
      purpose: 'conversation',
      model: 'gpt-5.6-luna',
      outcome: 'completed',
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 30,
      totalTokens: 150,
    });

    expect(infoSpy).toHaveBeenCalledWith(LLM_USAGE_LOG_MESSAGE, {
      service: 'livetalk',
      purpose: 'conversation',
      model: 'gpt-5.6-luna',
      reasoningEffort: undefined,
      outcome: 'completed',
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 30,
      totalTokens: 150,
    });
    // usage を取得できているので警告は出ない
    expect(warnSpy).not.toHaveBeenCalled();

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('reasoningEffort 未指定時は undefined のまま渡す', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    logLLMUsage({
      service: 'quick-clip',
      purpose: 'emotion-scoring',
      model: 'gpt-5.6-luna',
      outcome: 'completed',
      inputTokens: 1,
      outputTokens: 1,
    });

    const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(context.reasoningEffort).toBeUndefined();
    expect(context.service).toBe('quick-clip');
    expect(context.purpose).toBe('emotion-scoring');

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('usage が 1 つも読めなかった場合のカナリア警告', () => {
    it('usage 由来のフィールドが全て undefined なら logger.warn を1行出す', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

      logLLMUsage({
        service: 'stock-tracker',
        purpose: 'stock-analysis',
        model: 'gpt-5.6-luna',
        outcome: 'completed',
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(LLM_USAGE_WARN_MESSAGES.NO_USAGE_EXTRACTED, {
        service: 'stock-tracker',
        purpose: 'stock-analysis',
        model: 'gpt-5.6-luna',
        outcome: 'completed',
      });

      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('outcome=aborted（ストリーミング中断による意図した欠測）では警告しない', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

      logLLMUsage({
        service: 'livetalk',
        purpose: 'conversation',
        model: 'gpt-5.6-luna',
        outcome: 'aborted',
      });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('1 つでもフィールドが取得できていれば警告しない', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

      logLLMUsage({
        service: 'livetalk',
        purpose: 'conversation',
        model: 'gpt-5.6-luna',
        outcome: 'completed',
        totalTokens: 10,
      });

      expect(warnSpy).not.toHaveBeenCalled();

      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
