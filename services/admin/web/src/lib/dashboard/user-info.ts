/**
 * ダッシュボードのユーザー情報・認証ステータスに出す値の整形
 */
import { formatJstDateTime } from '@nagiyu/common';

export const DASHBOARD_LABELS = {
  NAME_UNSET: '未設定',
} as const;

/**
 * 表示名を返す。Auth 側に名前がないとき、セッションには空文字が入るため「未設定」で置き換える。
 */
export function formatDisplayName(name: string | null | undefined): string {
  return name ? name : DASHBOARD_LABELS.NAME_UNSET;
}

/**
 * セッションの有効期限を JST の "YYYY/MM/DD HH:mm" にする。
 *
 * Auth.js はセッションを読むたびに JWT を再署名し、`session.expires` には
 * その JWT の exp と同じ値が入る。そのため JWT の有効期限としてそのまま扱える。
 *
 * @param expires ISO 8601 文字列
 * @throws 解釈できない日時の場合
 */
export function formatSessionExpiry(expires: string): string {
  return formatJstDateTime(new Date(expires));
}
