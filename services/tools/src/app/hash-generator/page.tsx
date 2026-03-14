import type { Metadata } from 'next';
import HashGeneratorClient from './HashGeneratorClient';

export const metadata: Metadata = {
  title: 'ハッシュ生成ツール - Tools',
  description:
    '入力した文字列から SHA-256 / SHA-512 のハッシュ値（Hex）を生成できる無料ツールです。ブラウザ内で完結するため、入力内容を外部に送信せずに利用できます。',
};

export default function HashGeneratorPage() {
  return <HashGeneratorClient />;
}
