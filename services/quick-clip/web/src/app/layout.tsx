import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';
import { SessionHeader, SessionProviderWrapper } from '@nagiyu/ui/session-provider';
import '@nagiyu/ui/tokens.css';
import '@nagiyu/ui/base.css';

/**
 * layout 全体を動的レンダリングに強制する。
 *
 * NEXT_PUBLIC_AUTH_URL は Docker ビルド時には渡されないため、静的にプリレンダすると
 * ビルド時の空文字が HTML に固定され、ログイン・サインアウト先が壊れる。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'さくっとクリップ',
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
  // client component 内で参照するとビルド時にインライン化されて空文字になるため、
  // サーバーのランタイム env から解決して prop として渡す。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      <body>
        <SessionProviderWrapper>
          <ServiceLayout
            headerSlot={
              <SessionHeader
                title="さくっとクリップ"
                ariaLabel="さくっとクリップ ホームページに戻る"
                authUrl={authUrl}
                showSignIn
              />
            }
            footerProps={{ version, commercialTransactionsHref: '/legal/tokushoho' }}
          >
            {children}
          </ServiceLayout>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
