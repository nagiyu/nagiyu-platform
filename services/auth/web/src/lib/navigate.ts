/**
 * ブラウザナビゲーションのユーティリティ。
 * テスト環境でモック可能なようにモジュールとして分離する。
 */

/**
 * 指定 URL に移動する。window.location.assign のラッパー。
 */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
