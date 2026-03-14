import type { Metadata } from 'next';
import UrlEncoderClient from './UrlEncoderClient';

export const metadata: Metadata = {
  title: 'URL エンコーダー / デコーダー - Tools',
  description:
    'URLに含まれる文字列をパーセントエンコーディング形式へ変換し、エンコード済み文字列を元のテキストへデコードできる無料ツールです。ブラウザ内で完結するため、入力内容を外部に送信せずに変換できます。',
};

export default function UrlEncoderPage() {
  return <UrlEncoderClient />;
}
