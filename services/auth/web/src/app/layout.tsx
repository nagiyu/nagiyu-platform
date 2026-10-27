import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';
import { SessionHeader, SessionProviderWrapper } from '@nagiyu/ui/session-provider';
import '@nagiyu/ui/tokens.css';
import '@nagiyu/ui/base.css';

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
        {/* SessionHeader は useSession を使うため、SessionProvider の内側に置く */}
        <SessionProviderWrapper>
          <ServiceLayout
            headerSlot={
              // auth 自身がサインアウトの提供元なので、同一オリジンの相対 URL になるよう空文字を渡す
              <SessionHeader title="Auth" ariaLabel="Auth ホームページに戻る" authUrl="" />
            }
            footerProps={{ version }}
          >
            {children}
          </ServiceLayout>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
