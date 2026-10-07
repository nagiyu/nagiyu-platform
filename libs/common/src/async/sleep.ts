/**
 * 指定ミリ秒だけ待機する。
 * リトライ間隔などの待機を各所で重複実装しないよう、共通の実装をここに置く。
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
