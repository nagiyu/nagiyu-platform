import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'LiveTalk',
  description: 'Live2D と AI を組み合わせたコンパニオン PWA',
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
