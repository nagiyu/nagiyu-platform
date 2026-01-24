import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Box } from '@mui/material';
import { Header, Footer, type NavigationItem } from '@nagiyu/ui';
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/Info';
import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tools',
  description: '便利な開発ツール集',
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
          <Header
            title="Tools"
            href="/"
            ariaLabel="Tools ホームページに戻る"
            navigationItems={navigationItems}
          />
          <Box
            component="main"
            sx={{
              minHeight: 'calc(100vh - 64px - 80px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </Box>
          <Footer version={version} contactHref="/contact" />
        </ThemeRegistry>
      </body>
    </html>
  );
}
