import type { Metadata } from 'next';
import { ServiceWorkerRegistration } from '@nagiyu/ui';
import ThemeRegistry from '@/components/ThemeRegistry';
import '@nagiyu/ui/tokens.css';
import './globals.css';

/**
 * layout 全体を動的レンダリングに強制する。
 *
 * NEXT_PUBLIC_AUTH_URL は Docker ビルド時には build-arg として渡されないため、
 * 静的プリレンダ（○ Static）のままだと process.env.NEXT_PUBLIC_AUTH_URL がビルド時に
 * 空文字で評価され、ThemeRegistry の authUrl="" が静的 HTML に固定されてしまう。
 * その結果 ECS タスク定義のランタイム env を拾えず、サインアウト URL が
 * 相対 URL になって auth サービスに集約されない。
 * 動的レンダリングを強制することで、リクエスト時にランタイム env を読み込ませる。
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stock Tracker',
  description: 'Real-time stock price tracking and alerts',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const version = process.env.APP_VERSION || '1.0.0';
  // NEXT_PUBLIC_AUTH_URL はサーバーのランタイム env から解決する。
  // Docker ビルド時には build-arg として渡されないため、client component 内で
  // process.env.NEXT_PUBLIC_AUTH_URL を参照するとビルド時インライン化で空文字になる。
  // サーバーで解決して ThemeRegistry へ prop として渡すことで
  // ECS タスク定義のランタイム env が正しくサインアウト URL に反映される。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      <body>
        <ServiceWorkerRegistration
          subscribeEndpoint="/api/push/refresh"
          vapidPublicKeyEndpoint="/api/push/vapid-public-key"
        />
        <ThemeRegistry version={version} authUrl={authUrl}>
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
