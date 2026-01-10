import type { Metadata, Viewport } from 'next';
import ThemeRegistry from '@/components/ThemeRegistry';

export const metadata: Metadata = {
  title: 'Codec Converter',
  description: 'Video codec conversion service',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '1.0.0';

  return (
    <html lang="ja">
      <body>
        <ThemeRegistry version={version}>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
