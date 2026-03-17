import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '@nagiyu/ui';
import ThemeRegistry from '@/components/ThemeRegistry';
import UserRegistrationInitializer from '@/components/UserRegistrationInitializer';

export const metadata: Metadata = {
  title: 'Share Together',
  description: 'みんなでシェアリスト',
  manifest: '/manifest.json',
};

const DEFAULT_APP_VERSION = '1.0.0';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || DEFAULT_APP_VERSION;

  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration />
        <UserRegistrationInitializer />
        <ThemeRegistry version={version}>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
