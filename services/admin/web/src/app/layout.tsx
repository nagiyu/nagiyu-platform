import type { Metadata, Viewport } from 'next';
import { ServiceLayout } from '@nagiyu/ui';
import { SessionHeader, SessionProviderWrapper } from '@nagiyu/ui/session-provider';
import '@nagiyu/ui/tokens.css';
import './globals.css';

/**
 * layout 全体を動的レンダリングに強制する。
 *
 * NEXT_PUBLIC_AUTH_URL は Docker ビルド時には build-arg として渡されないため、
 * 静的プリレンダのままだとビルド時に空文字で評価され、authUrl="" が静的 HTML に
 * 固定されてしまう。その結果 ECS タスク定義のランタイム env を拾えず、
 * サインアウト URL が相対 URL になって auth サービスに集約されない。
 * 動的レンダリングを強制することで、リクエスト時にランタイム env を読み込ませる。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'nagiyu Admin - 管理画面',
  description: 'nagiyu プラットフォームの管理者向けダッシュボード',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '1.0.0';
  // client component 内で参照するとビルド時インライン化で空文字になるため、
  // サーバーのランタイム env から解決して prop として渡す。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      <body>
        {/* SessionHeader は useSession を使うため、SessionProvider の内側に置く */}
        <SessionProviderWrapper>
          <ServiceLayout
            headerSlot={
              <SessionHeader title="Admin" ariaLabel="Admin ホームページに戻る" authUrl={authUrl} />
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
