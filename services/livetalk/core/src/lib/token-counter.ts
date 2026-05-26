import { encodingForModel, type Tiktoken, type TiktokenModel } from 'js-tiktoken';
import { DEFAULT_LLM_CONTEXT_TOKEN_LIMIT } from '../constants.js';

/**
 * テキストのトークン数を見積もるカウンタ。
 *
 * Phase 2a では「直近メッセージをトークン上限ベースで取得する」要件のためだけに
 * 利用する。Phase 2c で LLM 統合される際にも同じインスタンスを再利用できる。
 */
export interface TokenCounter {
  /**
   * メッセージ 1 件分のテキストのトークン数を返す（純粋関数）。
   */
  countTokens(text: string): number;
  /**
   * メッセージのオーバーヘッド（role tag 等）を含めた概算トークン数を返す。
   * LLM プロンプト構築の正確性は Phase 2c で精緻化するため、ここでは
   * 「テキストのトークン数 + 4」程度のラフな見積もりとする
   * （OpenAI の Chat Completions のトークン換算ガイドに準拠した既定値）。
   */
  countTokensForMessage(text: string): number;
}

/**
 * 既定モデル。コスト・速度のトレードオフから Phase 2c で会話用に
 * `gpt-4o` を採用する予定のため、トークン換算もそれに合わせる。
 */
const DEFAULT_MODEL: TiktokenModel = 'gpt-4o';

/**
 * 1 メッセージあたりに加算する固定オーバーヘッド（OpenAI 公式 cookbook 由来）。
 */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

export class TiktokenCounter implements TokenCounter {
  private readonly encoder: Tiktoken;

  constructor(model: TiktokenModel = DEFAULT_MODEL) {
    this.encoder = encodingForModel(model);
  }

  public countTokens(text: string): number {
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  public countTokensForMessage(text: string): number {
    return this.countTokens(text) + PER_MESSAGE_OVERHEAD_TOKENS;
  }
}

/**
 * シングルトン的に取り回すためのキャッシュ。
 * `js-tiktoken` のエンコーダ生成は数 MB の BPE テーブル読み込みを含むため、
 * リクエストごとの再生成を避ける。
 */
let cachedCounter: TokenCounter | null = null;

/**
 * 既定のトークンカウンタ（`gpt-4o`）を返す。
 * テスト等で差し替えたい場合は `setTokenCounterForTesting()` を利用する。
 */
export function getDefaultTokenCounter(): TokenCounter {
  if (!cachedCounter) {
    cachedCounter = new TiktokenCounter();
  }
  return cachedCounter;
}

export function setTokenCounterForTesting(counter: TokenCounter | null): void {
  cachedCounter = counter;
}

/**
 * 環境変数または定数からトークン上限を解決する。
 *
 * @param override 明示的に上限を指定する場合の値（テスト用）。
 */
export function resolveContextTokenLimit(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  const fromEnv = process.env.LLM_CONTEXT_TOKEN_LIMIT;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_LLM_CONTEXT_TOKEN_LIMIT;
}
