import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: 'QuickClip',
  description: '動画の見どころを抽出するサービス',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const version = process.env.APP_VERSION || '0.1.0';

  return (
    <html lang="ja">
      <body>
        <ServiceLayout
          headerProps={{
            title: 'QuickClip',
            ariaLabel: 'QuickClip ホームページに戻る',
          }}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
