import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Container } from '@mui/material';
import { AccessDeniedView } from '@nagiyu/ui';
import { UserEditForm } from './user-edit-form';
import { getSession } from '@/lib/auth/session';

export default async function UserEditPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  // roles:assign 権限がない場合は URL を変えずに権限なし画面を表示する。
  // auth 自身が auth サービスのため authUrl は空文字とし、/refresh 等を同一オリジンの相対 URL にする。
  if (!hasPermission(session.user.roles, 'roles:assign')) {
    return <AccessDeniedView authUrl="" />;
  }

  const { userId } = await params;

  return (
    <Container maxWidth="md">
      <UserEditForm userId={userId} />
    </Container>
  );
}
