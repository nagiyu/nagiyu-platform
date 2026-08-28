import { logger } from '../../../src/logger/logger.js';
import {
  extractLLMTokenUsage,
  logLLMUsage,
  LLM_USAGE_LOG_MESSAGE,
} from '../../../src/llm-usage/usage-log.js';

describe('extractLLMTokenUsage', () => {
  it('OpenAI Responses API の usage 形式から各トークン数を抽出する', () => {
    const usage = {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 20, cache_write_tokens: 0 },
      output_tokens: 50,
      output_tokens_details: { reasoning_tokens: 30 },
      total_tokens: 150,
    };

    expect(extractLLMTokenUsage(usage)).toEqual({
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 30,
      totalTokens: 150,
    });
  });

  it('null が渡されても throw せず全フィールド undefined を返す', () => {
    expect(extractLLMTokenUsage(null)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('undefined が渡されても throw しない', () => {
    expect(() => extractLLMTokenUsage(undefined)).not.toThrow();
    expect(extractLLMTokenUsage(undefined)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('数値でない・想定外の型が来ても throw せず undefined として扱う', () => {
    expect(() => extractLLMTokenUsage('unexpected string')).not.toThrow();
    expect(() => extractLLMTokenUsage(123)).not.toThrow();
    expect(() => extractLLMTokenUsage(['a', 'b'])).not.toThrow();
    expect(extractLLMTokenUsage('unexpected string')).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('details が欠損していても throw せず該当フィールドのみ undefined になる', () => {
    const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };

    expect(extractLLMTokenUsage(usage)).toEqual({
      inputTokens: 10,
      cachedInputTokens: undefined,
      outputTokens: 5,
      reasoningTokens: undefined,
      totalTokens: 15,
    });
  });

  it('input_tokens が数値でない場合は undefined になる', () => {
    const usage = { input_tokens: '100', output_tokens: 5 };

    expect(extractLLMTokenUsage(usage)).toEqual({
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: 5,
      reasoningTokens: undefined,
      totalTokens: undefined,
    });
  });
});

describe('logLLMUsage', () => {
  it('logger.info を LLM_USAGE_LOG_MESSAGE とフラットな context で呼び出す', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    logLLMUsage({
      service: 'livetalk',
      purpose: 'conversation',
      model: 'gpt-5.6-luna',
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
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningTokens: 30,
      totalTokens: 150,
    });

    infoSpy.mockRestore();
  });

  it('reasoningEffort 未指定時は undefined のまま渡す（この Step では effort を変更しない）', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    logLLMUsage({
      service: 'quick-clip',
      purpose: 'emotion-scoring',
      model: 'gpt-5.6-luna',
    });

    const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(context.reasoningEffort).toBeUndefined();
    expect(context.service).toBe('quick-clip');
    expect(context.purpose).toBe('emotion-scoring');

    infoSpy.mockRestore();
  });
});
