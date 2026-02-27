import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Share Together',
  description: 'みんなでシェアリスト',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
