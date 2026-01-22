import { getSession } from '@/lib/auth';
import { hasPermission } from '@nagiyu/common';
import HomePageClient from '@/components/HomePageClient';
import QuickActions from '@/components/QuickActions';

export default async function Home() {
  const session = await getSession();

  // 権限チェック: stocks:manage-data を持っているか
  const hasManageDataPermission = session
    ? hasPermission(session.user.roles, 'stocks:manage-data')
    : false;

  return (
    <HomePageClient>
      <QuickActions hasManageDataPermission={hasManageDataPermission} />
    </HomePageClient>
  );
}
