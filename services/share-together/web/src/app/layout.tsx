import type { Metadata } from 'next';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'Share Together',
  description: 'みんなでシェアリスト',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
