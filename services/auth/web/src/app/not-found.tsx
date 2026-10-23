import { NotFoundView } from '@nagiyu/ui';

/**
 * 未一致 URL の 404 画面。
 *
 * ルート直下に置くことで、ルートレイアウト (ヘッダー・フッター・テーマ) の内側に描かれ、
 * 全ルートの未一致 URL を受ける。
 */
export default function NotFound() {
  return <NotFoundView />;
}
