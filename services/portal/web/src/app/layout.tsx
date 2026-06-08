import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Box } from '@mui/material';
import {
  AppThemeProvider,
  Header,
  Footer,
  type NavigationItem,
  type FooterLinkGroup,
} from '@nagiyu/ui';
import HomeIcon from '@mui/icons-material/Home';
import ArticleIcon from '@mui/icons-material/Article';
import AppsIcon from '@mui/icons-material/Apps';
import InfoIcon from '@mui/icons-material/Info';
import '@nagiyu/ui/tokens.css';
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
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'nagiyu - サービス一覧・技術ポータル',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nagiyu - サービス一覧・技術ポータル',
    description:
      'nagiyu が提供する各種サービスのドキュメント・技術記事を掲載したポータルサイトです。',
    images: ['/og-default.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#1976d2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION || '1.0.0';
  const isProduction = process.env.NODE_ENV === 'production';

  /** git 初コミットの年。著作権表記の開始年として使用する。 */
  const copyrightStartYear = 2026;
  const currentYear = new Date().getFullYear();
  const copyrightYearRange =
    currentYear > copyrightStartYear
      ? `${copyrightStartYear}–${currentYear}`
      : String(copyrightStartYear);
  const copyright = `© ${copyrightYearRange} nagiyu`;

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

  /** フッターナビゲーションリンクグループ */
  const footerLinks: FooterLinkGroup[] = [
    {
      title: 'メインコンテンツ',
      items: [
        { label: 'ホーム', href: '/' },
        { label: 'サービス一覧', href: '/services' },
        { label: '技術記事', href: '/tech' },
      ],
    },
    {
      title: 'カテゴリ',
      items: [
        { label: 'AWS', href: '/tech/category/aws' },
        { label: 'Next.js', href: '/tech/category/nextjs' },
        { label: '開発スタック', href: '/tech/category/dev-stack' },
      ],
    },
    {
      title: 'サイト情報',
      items: [
        { label: 'About', href: '/about' },
        { label: 'お問い合わせ', href: '/contact' },
      ],
    },
    {
      title: '法的情報',
      items: [
        { label: 'プライバシーポリシー', href: '/privacy' },
        { label: '利用規約', href: '/terms' },
      ],
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
        <AppThemeProvider>
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
            <Footer
              version={version}
              contactHref="/contact"
              links={footerLinks}
              copyright={copyright}
            />
          </Box>
        </AppThemeProvider>
      </body>
    </html>
  );
}
