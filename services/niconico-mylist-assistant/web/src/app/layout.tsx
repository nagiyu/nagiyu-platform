import type { Metadata, Viewport } from 'next';
import { ServiceLayout, ServiceWorkerRegistration, type NavigationItem } from '@nagiyu/ui';
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
  title: 'niconico-mylist-assistant',
  description: 'ニコニコ動画のマイリスト登録を自動化する補助ツール',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

const navigationItems: NavigationItem[] = [
  { label: 'ホーム', href: '/' },
  { label: 'インポート', href: '/import' },
  { label: '動画一覧', href: '/mylist' },
  { label: 'マイリスト登録', href: '/mylist/register' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '0.1.0';
  // client component 内で参照するとビルド時インライン化で空文字になるため、
  // サーバーのランタイム env から解決して prop として渡す。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration
          subscribeEndpoint="/api/push/subscribe"
          vapidPublicKeyEndpoint="/api/push/vapid-public-key"
        />
        {/* SessionHeader は useSession を使うため、SessionProvider の内側に置く。
            トップページは未ログインでも開けるが、その場合は session が空になり
            アカウントメニューが出ないだけでヘッダー自体は表示される。 */}
        <SessionProviderWrapper>
          <ServiceLayout
            headerSlot={
              <SessionHeader
                title="Niconico Mylist Assistant"
                ariaLabel="Niconico Mylist Assistant ホームページに戻る"
                navigationItems={navigationItems}
                authUrl={authUrl}
              />
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
