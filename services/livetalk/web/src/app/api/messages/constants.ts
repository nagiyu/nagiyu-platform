export const MESSAGES_ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエスト形式が不正です',
  FETCH_FAILED: 'メッセージの取得に失敗しました',
} as const;

/**
 * クエリパラメータ `tokenLimit` で許容する範囲。
 * デフォルト（40K）よりも極端に小さい・大きい値を渡されないよう保護する。
 */
export const MESSAGES_MIN_TOKEN_LIMIT = 100;
export const MESSAGES_MAX_TOKEN_LIMIT = 200_000;
