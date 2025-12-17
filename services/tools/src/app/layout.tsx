import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

export const metadata = {
  title: 'Tools',
  description: '便利な開発ツール集',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
