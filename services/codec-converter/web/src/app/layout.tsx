import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: 'Codec Converter',
  description: 'Video codec conversion service',
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
  const version = process.env.APP_VERSION || '1.0.0';

  return (
    <html lang="ja">
      <body>
        <ServiceLayout
          headerProps={{
            title: 'Codec Converter',
            ariaLabel: 'Codec Converter ホームページに戻る',
          }}
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </body>
    </html>
  );
}
