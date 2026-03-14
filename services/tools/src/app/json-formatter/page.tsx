import type { Metadata } from 'next';
import { jsonFormatterStructuredData, toJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = {
  title: 'JSON 整形ツール - Tools',
  description:
    'JSON整形ツールは、JSONの整形（Pretty Print）・圧縮（Minify）・検証をブラウザ上で実行できます。APIレスポンスや設定ファイルを見やすく整理し、コピーして再利用しやすい形式に変換できます。',
};

import JsonFormatterClient from './JsonFormatterClient';

export default function JsonFormatterPage() {
  return (
    <>
      <script type="application/ld+json">{toJsonLd(jsonFormatterStructuredData)}</script>
      <JsonFormatterClient />
    </>
  );
}
