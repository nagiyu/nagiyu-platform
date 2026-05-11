import type { Metadata } from 'next';
import { ServiceLayout, ServiceWorkerRegistration } from '@nagiyu/ui';
import LastVisitedPathController from '@/components/LastVisitedPathController';
import { Navigation } from '@/components/Navigation';
import UserRegistrationInitializer from '@/components/UserRegistrationInitializer';
import '@nagiyu/ui/tokens.css';

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
        <LastVisitedPathController />
        <ServiceLayout
          headerProps={{ title: 'Share Together', ariaLabel: 'Share Together ホームページに戻る' }}
          headerSlot={<Navigation />}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
