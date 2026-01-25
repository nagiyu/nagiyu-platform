import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '乗り換え変換ツール',
  description:
    '乗り換え案内のテキストを整形してコピーするツールです。出発地、到着地、時刻、経路などの情報を簡単に整形できます。ブラウザ内で処理され、データは外部に送信されません。',
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
