import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Box } from '@mui/material';
import { Header, Footer, type NavigationItem } from '@nagiyu/ui';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tools - 便利なオンラインツール集',
    template: '%s | Tools',
  },
  description:
    'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。乗り換え案内の整形ツールなど、すべてのツールはブラウザ内で動作し、入力データは外部サーバーに送信されません。PWA対応でオフラインでも利用可能、プライバシーを重視した安全な設計です。',
  keywords: ['オンラインツール', '便利ツール', '無料ツール', '乗り換え案内', 'PWA', 'オフライン'],
  authors: [{ name: 'nagiyu' }],
  creator: 'nagiyu',
  publisher: 'nagiyu',
  metadataBase: new URL('https://nagiyu.com'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://nagiyu.com',
    title: 'Tools - 便利なオンラインツール集',
    description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
    siteName: 'Tools',
    images: [
      {
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Tools アイコン',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Tools - 便利なオンラインツール集',
    description: 'Toolsは、日常的に便利なオンラインツール群を提供する無料のWebアプリケーションです。',
    images: ['/icon-512x512.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tools',
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '1.0.0';
  const isProduction = process.env.NODE_ENV === 'production';

  const navigationItems: NavigationItem[] = [
    {
      label: 'ホーム',
      href: '/',
      icon: <HomeIcon />,
    },
    {
      label: 'About',
      href: '/about',
      icon: <InfoIcon />,
    },
  ];

  return (
    <html lang="ja">
      <head>
        {isProduction && (
          <Script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6784165593921713"
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>
        <ThemeRegistry version={version}>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header
              title="Tools"
              href="/"
              ariaLabel="Tools ホームページに戻る"
              navigationItems={navigationItems}
            />
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {children}
            </Box>
            <Footer version={version} contactHref="/contact" />
          </Box>
        </ThemeRegistry>
      </body>
    </html>
  );
}
