import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '@nagiyu/ui';
import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stock Tracker',
  description: 'Real-time stock price tracking and alerts',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const version = process.env.APP_VERSION || '1.0.0';

  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration
          subscribeEndpoint="/api/push/refresh"
          vapidPublicKeyEndpoint="/api/push/vapid-public-key"
        />
        <ThemeRegistry version={version}>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
