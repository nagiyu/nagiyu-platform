import type { Metadata, Viewport } from 'next';
import ThemeRegistry from '../components/ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: 'niconico-mylist-assistant - Nagiyu Platform',
  description: 'ニコニコ動画のマイリスト登録を自動化する補助ツール',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '0.1.0';

  return (
    <html lang="ja">
      <body>
        <ThemeRegistry version={version}>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
