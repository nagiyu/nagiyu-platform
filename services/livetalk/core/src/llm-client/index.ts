/**
 * LLM クライアント抽象化レイヤー（Phase 2b / Issue #3248）。
 *
 * 利用側は通常 {@link createLLMClient} を呼ぶだけで OpenAI クライアントが返る。
 * 個別 Provider 実装を直接使いたい場合（テスト・特殊な設定）は {@link OpenAIClient} を
 * export しているのでそちらを利用する。
 *
 * Phase 2b 時点では OpenAI のみ実装。Anthropic 等の追加は必要になった時点で
 * `openai-client.ts` と同じパターンで実装を増やし、Factory にも分岐を足す。
 */

export type {
  ChatMessage,
  ChatOptions,
  ChatPurpose,
  ILLMClient,
  PurposeModelMap,
} from './types.js';

export {
  OpenAIClient,
  OPENAI_DEFAULT_MODELS,
  OPENAI_ERROR_MESSAGES,
  type OpenAIClientOptions,
} from './openai-client.js';

export {
  createLLMClient,
  FACTORY_ERROR_MESSAGES,
  type CreateLLMClientOptions,
  type ProviderSecretConfig,
} from './factory.js';
