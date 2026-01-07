import { auth } from '../../auth';
import type { Session } from '../../types/auth';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 * NextAuth が自動的に JWT の検証を行う。
 *
 * @returns セッション情報、または未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    user: {
      email: session.user.email || '',
      roles: session.user.roles || [],
    },
  };
}
