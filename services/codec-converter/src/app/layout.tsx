import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Codec Converter',
  description: '動画ファイルを別のコーデックに変換するサービス',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
