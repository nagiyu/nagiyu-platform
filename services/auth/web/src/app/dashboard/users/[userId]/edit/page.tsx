import { auth } from '@nagiyu/auth-core';
import { redirect } from 'next/navigation';
import { hasPermission } from '@nagiyu/common';
import { Container } from '@mui/material';
import { UserEditForm } from './user-edit-form';

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();

  if (!session) {
    redirect('/signin');
  }

  // roles:assign 権限がない場合はユーザー一覧にリダイレクト
  if (!hasPermission(session.user.roles, 'roles:assign')) {
    redirect('/dashboard/users');
  }

  const { userId } = await params;

  return (
    <Container maxWidth="md">
      <UserEditForm userId={userId} />
    </Container>
  );
}
