/**
 * リブトーク全体で参照するドメイン定数。
 *
 * MVP では桃瀬ひより 1 キャラのみを扱うため characterId は固定値とする
 * （`tasks/livetalk/external-design.md` 5 章「将来の拡張ポイント」も参照）。
 */
export const DEFAULT_CHARACTER_ID = 'hiyori';

/**
 * Message に付与する DynamoDB TTL（秒）。
 * Phase 3 で圧縮要約に置き換わるまでの保持期間。
 */
export const MESSAGE_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * LLM プロンプトに渡せるコンテキストのトークン上限の既定値。
 * 環境変数 `LLM_CONTEXT_TOKEN_LIMIT` で上書きできる。
 */
export const DEFAULT_LLM_CONTEXT_TOKEN_LIMIT = 40_000;

/**
 * トークン上限ベースのスキャンで 1 ページに読み込むメッセージ件数。
 * 上限到達時に余分な RCU を消費しないよう小さめに設定する。
 */
export const TOKEN_BUDGETED_QUERY_PAGE_SIZE = 50;

/**
 * 利用規約・プライバシーポリシーのバージョン。
 * 改定時にインクリメントし、ユーザーの再同意を促す。
 */
export const LIVETALK_TERMS_VERSION = '1.0.0';
export const LIVETALK_PRIVACY_VERSION = '1.0.0';

/**
 * Memory Tier C に付与する DynamoDB TTL（秒）。30 日後に自動削除。
 */
export const MEMORY_TIER_C_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Memory Tier D に付与する DynamoDB TTL（秒）。1 日後に自動削除。
 */
export const MEMORY_TIER_D_TTL_SECONDS = 1 * 24 * 60 * 60;

/**
 * 各 Tier の信頼度スコア推奨初期値。
 * 実際の決定は usecase 層（Phase 3b）に委ねる。Repository はこの値を参照しない。
 */
export const MEMORY_DEFAULT_CONFIDENCE = {
  A: 1.0,
  B: 0.8,
  C: 0.5,
  D: 0.2,
} as const;
