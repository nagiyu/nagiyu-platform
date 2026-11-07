import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createBillingStripe, createUserRepository, getBillingConfig } from '@nagiyu/auth-core';
import { getSession } from '@/lib/auth/session';
import { buildRefreshPath } from '@/lib/billing-urls';
import { sanitizeCallbackUrl } from '@/lib/callback-url';
import { loadPlansPageData, syncUserForPlans } from '@/lib/plans-data';
import { resolveBaseUrl } from '@/lib/signout';
import { PlansView } from './plans-view';

interface PlansPageProps {
  searchParams: Promise<{ checkout?: string | string[]; callbackUrl?: string | string[] }>;
}

/** 同じキーを重ねて配列になった値は、無いものとして扱う */
function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const params = await searchParams;
  const session = await getSession();
  const config = getBillingConfig();
  const baseUrl = resolveBaseUrl(await headers());
  const callbackUrl = sanitizeCallbackUrl(singleValue(params.callbackUrl), baseUrl);

  const deps = config
    ? { stripe: createBillingStripe(config.secretKey), userRepository: createUserRepository() }
    : null;

  // 通知より先に戻ってきても権利が揃うよう、同期してからロールの再取得へ送る
  if (deps && session && singleValue(params.checkout) === 'success') {
    await syncUserForPlans(deps, session.user.id);
    redirect(buildRefreshPath(baseUrl, callbackUrl));
  }

  const data = deps ? await loadPlansPageData(deps, session?.user.id ?? null) : null;

  return <PlansView data={data} callbackUrl={callbackUrl} />;
}
