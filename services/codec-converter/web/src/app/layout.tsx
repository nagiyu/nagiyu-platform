import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Codec Converter',
  description: 'Video codec conversion service',
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
