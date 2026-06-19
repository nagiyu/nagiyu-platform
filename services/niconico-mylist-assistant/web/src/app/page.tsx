import { getSession } from '@/lib/auth/session';
import HomePageClient from '@/components/HomePageClient';

export default async function Home() {
  const session = await getSession();
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // NEXT_PUBLIC_AUTH_URL はビルド時にクライアントバンドルへインライン化されるが、
  // Docker ビルドに build-arg として渡していないため client component 内で空になる。
  // サーバーコンポーネントでランタイム env を解決し prop として渡すことで回避する。
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';

  return (
    <HomePageClient
      userName={session?.user.name}
      isAuthenticated={!!session}
      appUrl={appUrl}
      authUrl={authUrl}
    />
  );
}
