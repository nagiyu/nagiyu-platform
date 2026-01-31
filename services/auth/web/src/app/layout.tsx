import type { Metadata, Viewport } from 'next';
import ThemeRegistry from '@/components/ThemeRegistry';
import { NextAuthProvider } from '@/components/next-auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Auth - Nagiyu Platform',
  description: 'Nagiyu Platform 認証サービス',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '1.0.0';

  return (
    <html lang="ja">
      <body>
        <NextAuthProvider>
          <ThemeRegistry version={version}>{children}</ThemeRegistry>
        </NextAuthProvider>
      </body>
    </html>
  );
}
