import type { Metadata } from 'next';
import Base64Client from './Base64Client';
import { base64StructuredData, toJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = {
  title: 'Base64 エンコーダー / デコーダー - Tools',
  description:
    '文字列を Base64 形式へエンコードし、Base64 文字列を元のテキストにデコードできる無料ツールです。ブラウザ内で完結するため、入力内容を外部に送信せずに変換できます。',
};

export default function Base64Page() {
  return (
    <>
      <script type="application/ld+json">{toJsonLd(base64StructuredData)}</script>
      <Base64Client />
    </>
  );
}
