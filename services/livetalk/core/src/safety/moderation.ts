/**
 * OpenAI Moderation API クライアント（Phase 2d / Issue #3250）。
 *
 * AI 応答後の二段チェックに使用する。
 * キーワード検出が主防衛線で、Moderation API は補助チェック。
 *
 * @see Issue #3250
 * @see tasks/livetalk/external-design.md ADR-009
 */

import OpenAI from 'openai';
import type { IModerationClient, ModerationResult } from './types.js';

export const MODERATION_ERROR_MESSAGES = {
  EMPTY_API_KEY: 'OpenAI API キーが指定されていません',
  EMPTY_TEXT: 'テキストが空です',
  API_FAILED: 'Moderation API 呼び出しに失敗しました',
} as const;

/** Moderation API で使用するモデル（Japanese text 対応） */
const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';

export interface OpenAIModerationClientOptions {
  /** OpenAI API キー。`client` を渡す場合は不要 */
  apiKey?: string;
  /** モデル名。既定: omni-moderation-latest */
  model?: string;
  /** テスト・差し替え用に既存の OpenAI クライアントを注入できる */
  client?: OpenAI;
}

/**
 * OpenAI Moderation API を {@link IModerationClient} 形にラップする実装。
 *
 * API エラー・タイムアウト時は Error を throw する（呼び出し側で fail-warn ハンドリング）。
 */
export class OpenAIModerationClient implements IModerationClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIModerationClientOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.apiKey) {
        throw new Error(MODERATION_ERROR_MESSAGES.EMPTY_API_KEY);
      }
      this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
    }
    this.model = options.model ?? DEFAULT_MODERATION_MODEL;
  }

  public async check(text: string): Promise<ModerationResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(MODERATION_ERROR_MESSAGES.EMPTY_TEXT);
    }

    const response = await this.client.moderations.create({
      input: trimmed,
      model: this.model,
    });

    const result = response.results[0];
    if (!result) {
      throw new Error(MODERATION_ERROR_MESSAGES.API_FAILED);
    }

    return {
      flagged: result.flagged,
      categories: result.categories as unknown as Record<string, boolean>,
    };
  }
}

/**
 * テスト・ローカル開発用の no-op Moderation クライアント。
 * 常に flagged=false を返す（セーフティチェックをスキップする）。
 */
export class NoOpModerationClient implements IModerationClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async check(_text: string): Promise<ModerationResult> {
    return { flagged: false, categories: {} };
  }
}
