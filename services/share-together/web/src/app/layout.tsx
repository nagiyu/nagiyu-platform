import type { Metadata } from 'next';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import ThemeRegistry from '@/components/ThemeRegistry';

export const metadata: Metadata = {
  title: 'Share Together',
  description: 'みんなでシェアリスト',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration />
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
