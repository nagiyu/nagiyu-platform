import {
  OpenAIClient,
  OpenAIEmbeddingClient,
  type OpenAIClientOptions,
  type OpenAIEmbeddingClientOptions,
} from './openai-client.js';
import type { IEmbeddingClient, ILLMClient, PurposeModelMap } from './types.js';

export const FACTORY_ERROR_MESSAGES = {
  MISSING_API_KEY: 'OpenAI API キーが指定されていません',
} as const;

export interface ProviderSecretConfig {
  /** API キーを直接渡す場合（テスト・ローカル開発用） */
  apiKey?: string;
  /** 用途別モデルの上書き */
  models?: Partial<PurposeModelMap>;
}

export interface CreateLLMClientOptions {
  /** OpenAI 用設定 */
  openai?: ProviderSecretConfig;
}

export interface CreateEmbeddingClientOptions {
  openai?: ProviderSecretConfig;
}

/**
 * LLM クライアントを設定に従って生成する Factory。
 *
 * API キー取得の優先順位：
 * 1. `options.openai.apiKey`（明示指定、テスト・ローカル用）
 * 2. `process.env.OPENAI_API_KEY`（deploy ワークフローが Secrets Manager から取得して注入する想定）
 *
 * 抽象化レイヤーは将来別 Provider を足せる構造にしてあるが、Phase 2b 時点では
 * 実装は OpenAI のみ。Provider 切替が必要になったタイミングでここに分岐を追加する。
 */
export function createLLMClient(options: CreateLLMClientOptions = {}): ILLMClient {
  const apiKey = resolveApiKey(options);
  const clientOptions: OpenAIClientOptions = { apiKey, models: options.openai?.models };
  return new OpenAIClient(clientOptions);
}

export function createEmbeddingClient(
  options: CreateEmbeddingClientOptions = {}
): IEmbeddingClient {
  const apiKey = resolveApiKey(options);
  const clientOptions: OpenAIEmbeddingClientOptions = { apiKey };
  return new OpenAIEmbeddingClient(clientOptions);
}

function resolveApiKey(options: CreateLLMClientOptions | CreateEmbeddingClientOptions): string {
  if (options.openai?.apiKey) {
    return options.openai.apiKey;
  }
  const fromEnv = process.env.OPENAI_API_KEY;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  throw new Error(FACTORY_ERROR_MESSAGES.MISSING_API_KEY);
}
