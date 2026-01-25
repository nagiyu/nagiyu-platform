import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '乗り換え変換ツール - Tools',
  description: '乗り換え案内のテキストを整形してコピーします',
  alternates: {
    canonical: 'https://nagiyu.com/transit-converter',
  },
};

export default function TransitConverterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
