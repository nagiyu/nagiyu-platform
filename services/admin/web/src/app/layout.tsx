import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'nagiyu Admin - 管理画面',
  description: 'nagiyu プラットフォームの管理者向けダッシュボード',
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
        <ServiceLayout
          headerProps={{ title: 'Admin', ariaLabel: 'Admin ホームページに戻る' }}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
