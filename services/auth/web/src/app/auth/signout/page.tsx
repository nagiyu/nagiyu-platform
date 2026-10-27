import { cookies, headers } from 'next/headers';
import { authConfig } from '@/lib/auth/auth';
import { resolveCancelUrlFromRequest } from '@/lib/signout';
import SignOutForm from './signout-form';

/**
 * サインアウト確認画面。
 *
 * next-auth の既定画面は英語のため、pages.signOut でこの画面に差し替える。
 */
export default async function SignOutPage() {
  const cancelUrl = resolveCancelUrlFromRequest(
    await cookies(),
    await headers(),
    authConfig.cookies?.callbackUrl?.name
  );

  return <SignOutForm cancelUrl={cancelUrl} />;
}
