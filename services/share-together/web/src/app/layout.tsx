import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '@nagiyu/react';
import { ServiceLayout, type NavigationItem } from '@nagiyu/ui';
import { SessionHeader, SessionProviderWrapper } from '@nagiyu/ui/session-provider';
import { InvitationBadge } from '@/components/InvitationBadge';
import LastVisitedPathController from '@/components/LastVisitedPathController';
import UserRegistrationInitializer from '@/components/UserRegistrationInitializer';
import '@nagiyu/ui/tokens.css';

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
  title: 'Share Together',
  description: 'みんなでシェアリスト',
  manifest: '/manifest.json',
};

const DEFAULT_APP_VERSION = '1.0.0';

/**
 * ナビゲーション項目。
 * 招待は件数バッジを伴うため、項目ではなく Header の actions で描画する。
 */
const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'リスト', href: '/lists' },
  { label: 'グループ', href: '/groups' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || DEFAULT_APP_VERSION;
  // client component 内で参照するとビルド時インライン化で空文字になるため、
  // サーバーのランタイム env から解決して prop として渡す。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration />
        <UserRegistrationInitializer />
        <LastVisitedPathController />
        {/* SessionHeader は useSession を使うため、SessionProvider の内側に置く */}
        <SessionProviderWrapper>
          <ServiceLayout
            headerSlot={
              <SessionHeader
                title="Share Together"
                ariaLabel="Share Together ホームページに戻る"
                navigationItems={NAVIGATION_ITEMS}
                actions={<InvitationBadge />}
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
