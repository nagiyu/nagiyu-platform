import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { ServiceLayout, ServiceWorkerRegistration } from '@nagiyu/ui';
import SessionProviderWrapper from '@/components/SessionProviderWrapper';
import ClientErrorReporter from '@/components/ClientErrorReporter';
import CharacterLicenseText from '@/components/CharacterLicenseText';
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
          CharacterProvider で ServiceLayout 全体をラップする。
          フッターは ServiceLayout 内部でレンダリングされるため、
          CharacterLicenseText（client component）がここで生成されても
          レンダリング位置（Provider 配下）で context が正しく解決される。
          layout.tsx は server component のまま維持する。
        */}
        <CharacterProvider>
          <ServiceLayout
            headerProps={{
              title: 'リブトーク',
              ariaLabel: 'リブトーク ホームに戻る',
            }}
            footerProps={{
              version,
              termsContent: liveTalkTermsSections,
              privacyContent: liveTalkPrivacySections,
              licenseText: <CharacterLicenseText />,
            }}
          >
            <ClientErrorReporter />
            <SessionProviderWrapper>{children}</SessionProviderWrapper>
          </ServiceLayout>
        </CharacterProvider>
      </body>
    </html>
  );
}
