import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';
import '@nagiyu/ui/tokens.css';

export const metadata: Metadata = {
  title: 'LiveTalk',
  description: 'Live2D と AI を組み合わせたコンパニオン PWA',
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '0.1.0';

  return (
    <html lang="ja">
      <body>
        <ServiceLayout
          headerProps={{
            title: 'リブトーク',
            ariaLabel: 'リブトーク ホームに戻る',
          }}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
