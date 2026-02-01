import { getSession } from '@/lib/auth/session';
import HomePageClient from '@/components/HomePageClient';

export default async function Home() {
  const session = await getSession();
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <HomePageClient
      userName={session?.user.name}
      isAuthenticated={!!session}
      appUrl={appUrl}
    />
  );
}
