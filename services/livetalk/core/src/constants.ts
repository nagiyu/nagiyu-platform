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
