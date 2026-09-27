import { logger } from '../logger/logger.js';
import type { LLMTokenUsage, LLMUsageLogInput, LLMUsageOutcome } from './types.js';

/**
 * usage ログのメッセージ。CloudWatch Logs Insights から集計する際の検索キーにもなるため
 * export し、テスト・集計クエリ側から参照できるようにする。
 */
export const LLM_USAGE_LOG_MESSAGE = '[llm-usage] LLM トークン使用量';

/**
 * usage ログの警告メッセージ。定数化し、テスト・集計クエリ側から参照できるようにする。
 */
export const LLM_USAGE_WARN_MESSAGES = {
  /**
   * usage 由来のフィールドを 1 件も取得できなかった場合の警告（カナリア）。
   * SDK/API のフィールド形式が変わり、抽出ロジックが追従できていない可能性を知らせる。
   */
  NO_USAGE_EXTRACTED:
    '[llm-usage] usage からトークン数を1件も取得できませんでした（SDK/API のフィールド形式が変わった可能性があります）',
} as const;

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
 * **Responses API 専用**。`input_tokens` / `output_tokens_details.reasoning_tokens` 等の
 * フィールド名は Responses API 固有の wire フォーマットであり、Provider 非依存ではない
 * （型 {@link LLMTokenUsage} 自体は Provider 非依存）。
 *
 * Embeddings API の usage は `prompt_tokens` / `total_tokens` という別形式のため、
 * **この関数を Embeddings API のレスポンスに使ってはならない**。誤って流用すると、
 * {@link logLLMUsage} のカナリア警告（{@link LLM_USAGE_WARN_MESSAGES.NO_USAGE_EXTRACTED}）は
 * 出るものの、静かに全フィールド undefined のログになる。関数名を Provider・API 双方に
 * 紐づけているのは、この誤用を型・命名の時点で防ぐため。
 *
 * なお Embeddings API の計測は現時点で対象外（Issue #3778 の実測でコストが $0.03 / 25 日と
 * 無視できる水準であり、かつ reasoning トークンも発生しないため）。
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
export function extractOpenAIResponsesUsage(usage: unknown): LLMTokenUsage {
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

/** {@link resolveOpenAIResponsesOutcome} が変換を許す `response.status` の値。 */
const OPENAI_RESPONSE_OUTCOME_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'incomplete',
  'failed',
]);

/**
 * OpenAI Responses API の `response.status` を {@link LLMUsageOutcome} に変換する。
 *
 * ストリーミング側（`response.completed` / `response.incomplete` / `response.failed` イベント）と
 * 非ストリーミング側（`responses.create` / `responses.parse` の戻り値の `status`）を
 * 同じ語彙（`outcome`）に揃えるための変換。
 *
 * SDK 型に依存させないため `unknown` を受け取る。`in_progress` 等、同期的な戻り値としては
 * 通常あり得ない status や、文字列でない値が来た場合は undefined を返す
 * （`aborted` はストリーミング中断専用の値なので、この関数からは返さない）。
 */
export function resolveOpenAIResponsesOutcome(status: unknown): LLMUsageOutcome | undefined {
  return typeof status === 'string' && OPENAI_RESPONSE_OUTCOME_STATUSES.has(status)
    ? (status as LLMUsageOutcome)
    : undefined;
}

/**
 * LLM 呼び出し 1 回分の usage を構造化ログとして出力する。
 *
 * CloudWatch Logs Insights で service / purpose 別に reasoning_tokens 等を集計するのが目的のため、
 * 各フィールドはネストさせずフラットな context に載せる。
 *
 * usage 由来のフィールド（inputTokens 等）が 1 つも取得できていない場合は、抽出ロジックが
 * SDK/API の変更に追従できていないおそれがあるため、あわせて {@link logger.warn} を出す
 * （カナリア）。ただし `outcome: 'aborted'`（ストリーミング中断による意図した欠測）は
 * 正常系のため警告しない。
 */
export function logLLMUsage(input: LLMUsageLogInput): void {
  const {
    service,
    purpose,
    model,
    reasoningEffort,
    outcome,
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
    outcome,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  });

  const noUsageExtracted =
    inputTokens === undefined &&
    cachedInputTokens === undefined &&
    outputTokens === undefined &&
    reasoningTokens === undefined &&
    totalTokens === undefined;

  if (outcome !== 'aborted' && noUsageExtracted) {
    logger.warn(LLM_USAGE_WARN_MESSAGES.NO_USAGE_EXTRACTED, { service, purpose, model, outcome });
  }
}
