import { getSession } from '@/lib/auth';
import { hasUserPermission } from '@nagiyu/common';
import HomePageClient from '@/components/HomePageClient';
import QuickActions from '@/components/QuickActions';

export default async function Home() {
  const session = await getSession();

  // 権限チェック: stocks:manage-data を持っているか
  const hasManageDataPermission = hasUserPermission(session?.user, 'stocks:manage-data');

  return (
    <HomePageClient>
      <QuickActions hasManageDataPermission={hasManageDataPermission} />
    </HomePageClient>
  );
}
