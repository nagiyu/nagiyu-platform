import type { Metadata, Viewport } from 'next';
import { ServiceLayout, ServiceWorkerRegistration } from '@nagiyu/ui';
import { Navigation } from '@/components/Navigation';
import './globals.css';

export const metadata: Metadata = {
  title: 'niconico-mylist-assistant',
  description: 'ニコニコ動画のマイリスト登録を自動化する補助ツール',
  manifest: '/manifest.json',
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
        <ServiceWorkerRegistration
          subscribeEndpoint="/api/push/subscribe"
          vapidPublicKeyEndpoint="/api/push/vapid-public-key"
        />
        <ServiceLayout
          headerProps={{
            title: 'Niconico Mylist Assistant',
            ariaLabel: 'Niconico Mylist Assistant ホームページに戻る',
          }}
          headerSlot={<Navigation />}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
