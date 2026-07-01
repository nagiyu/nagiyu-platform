import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { ServiceLayout, ServiceWorkerRegistration } from '@nagiyu/ui';
import SessionProviderWrapper from '@/components/SessionProviderWrapper';
import ClientErrorReporter from '@/components/ClientErrorReporter';
import CharacterLicenseText from '@/components/CharacterLicenseText';
import LiveTalkHeader from '@/components/LiveTalkHeader';
import { CharacterProvider } from '@/lib/characters/CharacterContext';
import '@nagiyu/ui/tokens.css';
import { liveTalkTermsSections } from '@/lib/legal/terms-data';
import { liveTalkPrivacySections } from '@/lib/legal/privacy-data';

export const metadata: Metadata = {
  title: 'LiveTalk',
  description: 'Live2D と AI を組み合わせたコンパニオン PWA',
  manifest: '/manifest.json',
  // iOS PWA（ホーム画面追加）で Web Push を受けるための設定（#5e と連携）
  appleWebApp: {
    capable: true,
    title: 'リブトーク',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon-192x192.png',
    apple: '/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '0.1.0';

  // NEXT_PUBLIC_AUTH_URL はサーバーのランタイム env から解決する。
  // client component 内で参照するとビルド時インライン化で空文字になるため、
  // サーバーで解決して prop として渡す（page.tsx の HomePageClient と同方式）。
  // これにより ECS タスク定義のランタイム env が正しくサインアウト URL に反映される。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <html lang="ja">
      {/* Cubism Core は pixi-live2d-display が window.Live2DCubismCore を参照するため
          他のスクリプトより先にロードする必要がある */}
      <Script src="/assets/cubism-core/live2dcubismcore.min.js" strategy="beforeInteractive" />
      <body>
        {/* 通知許可済みのユーザーは再訪時に自動で SW 登録・再購読する。
            初回の許可リクエストは NotificationToggle（page 内）が担う。 */}
        <ServiceWorkerRegistration
          subscribeEndpoint="/api/push/subscribe"
          vapidPublicKeyEndpoint="/api/push/vapid-public-key"
        />
        {/*
          CharacterProvider で最外をラップする。
          フッターは ServiceLayout 内部でレンダリングされるため、
          CharacterLicenseText（client component）がここで生成されても
          レンダリング位置（Provider 配下）で context が正しく解決される。

          SessionProviderWrapper は ServiceLayout 全体（headerSlot 含む）を包む。
          LiveTalkHeader は useSession を使うため、SessionProvider の内側にある必要がある。
          layout.tsx は server component のまま維持する。
        */}
        <CharacterProvider>
          <SessionProviderWrapper>
            <ServiceLayout
              headerSlot={<LiveTalkHeader authUrl={authUrl} />}
              footerProps={{
                version,
                termsContent: liveTalkTermsSections,
                privacyContent: liveTalkPrivacySections,
                licenseText: <CharacterLicenseText />,
              }}
            >
              <ClientErrorReporter />
              {children}
            </ServiceLayout>
          </SessionProviderWrapper>
        </CharacterProvider>
      </body>
    </html>
  );
}
