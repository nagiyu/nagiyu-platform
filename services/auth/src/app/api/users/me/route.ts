import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';

const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
} as const;

export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  const repo = new DynamoDBUserRepository();
  const user = await repo.getUserById(session.user.id);

  if (!user) {
    return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json(user);
}
