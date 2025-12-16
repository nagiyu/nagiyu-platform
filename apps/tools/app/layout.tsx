import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tools - 開発ツール集",
  description: "便利な開発ツールを集約したWebアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
