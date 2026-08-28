import { logger } from '../logger/logger.js';
import type { LLMTokenUsage, LLMUsageLogInput } from './types.js';

/**
 * usage ログのメッセージ。CloudWatch Logs Insights から集計する際の検索キーにもなるため
 * export し、テスト・集計クエリ側から参照できるようにする。
 */
export const LLM_USAGE_LOG_MESSAGE = '[llm-usage] LLM トークン使用量';

/**
 * `unknown` から数値プロパティを安全に読み出す。
 * 対象が object でない／プロパティが存在しない／数値でない場合は undefined を返す。
 */
function readNumberField(source: unknown, key: string): number | undefined {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * `unknown` からネストした object フィールドを安全に読み出す。
 */
function readObjectField(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  return (source as Record<string, unknown>)[key];
}

/**
 * OpenAI Responses API の usage オブジェクトからトークン使用量を抽出する。
 *
 * SDK 型に依存させないため `unknown` を受け取り、構造的に読む（SDK 7.5.0 で確認済みの形）。
 * ```
 * { input_tokens, input_tokens_details: { cached_tokens, cache_write_tokens },
 *   output_tokens, output_tokens_details: { reasoning_tokens }, total_tokens }
 * ```
 *
 * 計測の失敗が本処理を壊してはならないため、`null` / `undefined` / 想定外の型が来ても
 * throw せず、読めなかったフィールドは undefined のまま返す。
 */
export function extractLLMTokenUsage(usage: unknown): LLMTokenUsage {
  const inputTokensDetails = readObjectField(usage, 'input_tokens_details');
  const outputTokensDetails = readObjectField(usage, 'output_tokens_details');

  return {
    inputTokens: readNumberField(usage, 'input_tokens'),
    cachedInputTokens: readNumberField(inputTokensDetails, 'cached_tokens'),
    outputTokens: readNumberField(usage, 'output_tokens'),
    reasoningTokens: readNumberField(outputTokensDetails, 'reasoning_tokens'),
    totalTokens: readNumberField(usage, 'total_tokens'),
  };
}

/**
 * LLM 呼び出し 1 回分の usage を構造化ログとして出力する。
 *
 * CloudWatch Logs Insights で service / purpose 別に reasoning_tokens 等を集計するのが目的のため、
 * 各フィールドはネストさせずフラットな context に載せる。
 */
export function logLLMUsage(input: LLMUsageLogInput): void {
  const {
    service,
    purpose,
    model,
    reasoningEffort,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  } = input;

  logger.info(LLM_USAGE_LOG_MESSAGE, {
    service,
    purpose,
    model,
    reasoningEffort,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  });
}
