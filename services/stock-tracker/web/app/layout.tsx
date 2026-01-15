import type { Metadata } from 'next';
import { Box } from '@mui/material';
import { Header, Footer } from '@nagiyu/ui';
import ClientProviders from '@/components/ClientProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stock Tracker',
  description: 'Real-time stock price tracking and alerts',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <ClientProviders>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
            }}
          >
            <Header title="Stock Tracker" />
            <Box component="main" sx={{ flexGrow: 1 }}>
              {children}
            </Box>
            <Footer version="1.0.0" />
          </Box>
        </ClientProviders>
      </body>
    </html>
  );
}
