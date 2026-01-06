import { headers } from 'next/headers';

export interface Session {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

/**
 * Server Component でセッション情報を取得
 */
export async function getSession(): Promise<Session | null> {
  const headersList = await headers();
  const userId = headersList.get('x-user-id');
  const userEmail = headersList.get('x-user-email');
  const userRoles = headersList.get('x-user-roles');

  if (!userId || !userEmail || !userRoles) {
    return null;
  }

  return {
    user: {
      id: userId,
      email: userEmail,
      roles: JSON.parse(userRoles),
    },
  };
}
