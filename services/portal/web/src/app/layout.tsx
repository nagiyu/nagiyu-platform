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
import InfoIcon from '@mui/icons-material/Info';
import '@nagiyu/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'nagiyu - AWS と個人開発の実運用ノート',
    template: '%s - nagiyu',
  },
  description:
    '個人で複数の Web サービスを AWS 上で開発・運用する中で、実際に踏んだ失敗と、その場で下した判断を記録している技術メディアです。',
  keywords: ['nagiyu', '技術記事', 'AWS', '個人開発', '実運用', 'CI/CD', 'テスト', 'AI 開発'],
  authors: [{ name: 'nagiyu' }],
  creator: 'nagiyu',
  publisher: 'nagiyu',
  metadataBase: new URL('https://nagiyu.com'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://nagiyu.com',
    title: 'nagiyu - AWS と個人開発の実運用ノート',
    description:
      '個人で複数の Web サービスを AWS 上で運用する中で踏んだ失敗と、その場で下した判断の記録。',
    siteName: 'nagiyu',
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'nagiyu - AWS と個人開発の実運用ノート',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nagiyu - AWS と個人開発の実運用ノート',
    description:
      '個人で複数の Web サービスを AWS 上で運用する中で踏んだ失敗と、その場で下した判断の記録。',
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
        { label: '技術記事', href: '/tech' },
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
