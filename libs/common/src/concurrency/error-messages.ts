/**
 * 並列実行ヘルパー共通のエラーメッセージ。
 * 同じ検証を行う複数のヘルパーでメッセージが食い違わないよう、ここに 1 箇所だけ置く。
 */
export const CONCURRENCY_ERROR_MESSAGES = {
  INVALID_CONCURRENCY: '同時実行数は 1 以上の整数で指定してください',
} as const;
