import type { Metadata } from 'next';
import { NotFoundView } from '@nagiyu/ui';

/**
 * ブラウザのタブや履歴で、ほかのページと見分けられるようにする。
 * 付けないとレイアウトの既定タイトルのままになり、404 だと判別できない。
 * `@nagiyu/ui` の文言定数はクライアント境界の内側にあり、Server Component の metadata では
 * 文字列として読めないため、ここに直接書く。
 */
export const metadata: Metadata = {
  title: 'ページが見つかりません',
};

/**
 * 未一致 URL の 404 画面。
 *
 * ルート直下に置くことで、ルートレイアウト (ヘッダー・フッター・テーマ) の内側に描かれ、
 * 全ルートの未一致 URL を受ける。
 */
export default function NotFound() {
  return <NotFoundView />;
}
