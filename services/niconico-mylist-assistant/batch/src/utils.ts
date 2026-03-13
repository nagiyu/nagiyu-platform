/**
 * ユーティリティ関数
 */

/**
 * 現在時刻を ISO 8601 形式で取得
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * デフォルトのマイリスト名を生成
 * 形式: "自動登録 YYYY/MM/DD HH:MM:SS"
 */
export function generateDefaultMylistName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `自動登録 ${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
