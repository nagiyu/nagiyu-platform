/**
 * /api/chat で利用する定数。
 */
export const CHAT_ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエスト形式が不正です',
  EMPTY_TEXT: 'メッセージを入力してください',
  TEXT_TOO_LONG: 'メッセージが長すぎます（200 文字以内で入力してください）',
  INTERNAL_ERROR: '内部エラーが発生しました',
  /** レートリミット超過（1 分または 1 時間ウィンドウ） */
  RATE_LIMIT_EXCEEDED: 'リクエストが多すぎます。しばらく待ってから再送してください',
  /** 同一ユーザーの並行リクエストが実行中 */
  CONCURRENT_REQUEST: '処理中のリクエストがあります。完了をお待ちください',
  /** ストリームがタイムアウトした場合の error イベントメッセージ */
  STREAM_TIMEOUT: '応答がタイムアウトしました',
} as const;

export const CHAT_MAX_TEXT_LENGTH = 200;
