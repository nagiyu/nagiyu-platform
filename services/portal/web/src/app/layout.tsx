import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Box } from '@mui/material';
import { Header, Footer, type NavigationItem } from '@nagiyu/ui';
import HomeIcon from '@mui/icons-material/Home';
import ArticleIcon from '@mui/icons-material/Article';
import AppsIcon from '@mui/icons-material/Apps';
import InfoIcon from '@mui/icons-material/Info';
import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'nagiyu - サービス一覧・技術ポータル',
    template: '%s - nagiyu',
  },
  description:
    'nagiyu が提供する Tools・Quick Clip・Codec Converter・Stock Tracker など各種サービスのドキュメント、使い方ガイド、技術記事を掲載しています。',
  keywords: ['nagiyu', 'ポータル', 'サービス一覧', 'ツール', '技術記事', 'ドキュメント'],
  authors: [{ name: 'nagiyu' }],
  creator: 'nagiyu',
  publisher: 'nagiyu',
  metadataBase: new URL('https://nagiyu.com'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://nagiyu.com',
    title: 'nagiyu - サービス一覧・技術ポータル',
    description:
      'nagiyu が提供する各種サービスのドキュメント・技術記事を掲載したポータルサイトです。',
    siteName: 'nagiyu',
  },
  twitter: {
    card: 'summary',
    title: 'nagiyu - サービス一覧・技術ポータル',
    description:
      'nagiyu が提供する各種サービスのドキュメント・技術記事を掲載したポータルサイトです。',
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
      label: 'サービス',
      href: '/services',
      icon: <AppsIcon />,
    },
    {
      label: '技術記事',
      href: '/tech',
      icon: <ArticleIcon />,
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
        <ThemeRegistry>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header
              title="nagiyu"
              href="/"
              ariaLabel="nagiyu ホームページに戻る"
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
            <Footer version={version} contactHref="/about" />
          </Box>
        </ThemeRegistry>
      </body>
    </html>
  );
}
