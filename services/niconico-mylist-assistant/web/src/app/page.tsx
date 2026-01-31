import { getSession } from '@/lib/auth/session';
import HomePageClient from '@/components/HomePageClient';

export default async function Home() {
  const session = await getSession();

  return <HomePageClient userName={session?.user.name} isAuthenticated={!!session} />;
}
