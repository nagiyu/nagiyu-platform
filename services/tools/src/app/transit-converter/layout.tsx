import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '乗り換え変換ツール',
  description:
    '乗り換え案内のテキストを簡単に整形してコピーできる無料ツールです。出発地、到着地、時刻、経路などの必要な情報だけを抽出し、読みやすい形式に変換します。すべての処理はブラウザ内で完結し、入力データは外部に送信されないため、プライバシーも安心です。表示項目のカスタマイズにも対応しています。',
  keywords: ['乗り換え案内', '経路検索', 'テキスト整形', 'コピー'],
  openGraph: {
    title: '乗り換え変換ツール | Tools',
    description: '乗り換え案内のテキストを整形してコピーするツールです。',
  },
  alternates: {
    canonical: 'https://nagiyu.com/transit-converter',
  },
};

export default function TransitConverterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
