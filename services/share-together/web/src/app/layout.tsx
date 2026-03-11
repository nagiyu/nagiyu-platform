import type { Metadata } from 'next';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import ThemeRegistry from '@/components/ThemeRegistry';
import UserRegistrationInitializer from '@/components/UserRegistrationInitializer';

export const metadata: Metadata = {
  title: 'Share Together',
  description: 'みんなでシェアリスト',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration />
        <UserRegistrationInitializer />
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
