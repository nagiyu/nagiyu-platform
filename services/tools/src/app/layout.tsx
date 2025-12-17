import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Developer tools collection',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
