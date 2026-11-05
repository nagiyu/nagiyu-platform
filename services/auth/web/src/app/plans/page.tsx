import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Box, Card, CardContent, Container, Typography } from '@mui/material';
import { Button, Chip, Link as UiLink } from '@nagiyu/ui';
import { createBillingStripe, createUserRepository, getBillingConfig } from '@nagiyu/auth-core';
import { getSession } from '@/lib/auth/session';
import { buildRefreshPath, buildSignInPath } from '@/lib/billing-urls';
import { sanitizeCallbackUrl } from '@/lib/callback-url';
import { loadPlansPageData, syncUserForPlans } from '@/lib/plans-data';
import { PLANS_MESSAGES, type PlanCard } from '@/lib/plans';
import { resolveBaseUrl } from '@/lib/signout';
import { PlanActionButton } from './plan-actions';

interface PlansPageProps {
  searchParams: Promise<{ checkout?: string | string[]; callbackUrl?: string | string[] }>;
}

/** 同じキーを重ねて配列になった値は、無いものとして扱う */
function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function PlanCardView({ card, callbackUrl }: { card: PlanCard; callbackUrl: string | null }) {
  return (
    <Card component="section" aria-label={card.name}>
      <CardContent>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" component="h2">
            {card.name}
          </Typography>
          {card.state === 'subscribed' && <Chip size="sm">契約中</Chip>}
          {card.state === 'canceling' && <Chip size="sm">解約予約中</Chip>}
        </Box>
        {card.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {card.description}
          </Typography>
        )}
        <Typography variant="h5" component="p" sx={{ mt: 2 }}>
          {card.priceLabel ?? PLANS_MESSAGES.PRICE_UNAVAILABLE}
        </Typography>
        {card.stateLabel && (
          <Typography variant="body1" sx={{ mt: 1 }}>
            {card.stateLabel}
          </Typography>
        )}
        {card.manualLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {card.manualLabel}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          {card.state === 'guest' && (
            <Button asChild variant="solid">
              <Link href={buildSignInPath(callbackUrl)}>ログインして申し込む</Link>
            </Button>
          )}
          {card.canSubscribe && (
            <PlanActionButton
              endpoint="/api/billing/checkout"
              body={{ roleId: card.roleId, ...(callbackUrl ? { callbackUrl } : {}) }}
              label="申し込む"
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
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

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          プラン
        </Typography>

        {!data || !data.billingEnabled ? (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            {PLANS_MESSAGES.PREPARING}
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
              {data.cards.map((card) => (
                <PlanCardView key={card.roleId} card={card} callbackUrl={callbackUrl} />
              ))}
            </Box>

            {data.hasCustomer && (
              <Box sx={{ mt: 3 }}>
                <PlanActionButton
                  endpoint="/api/billing/portal"
                  body={callbackUrl ? { callbackUrl } : {}}
                  label="契約を管理"
                  variant="outline"
                />
              </Box>
            )}

            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              {PLANS_MESSAGES.NOTE}
            </Typography>
          </>
        )}

        {/* 課金が無効 (準備中) でも出す。決済事業者の審査が表記の URL を確かめるため */}
        <Box sx={{ mt: 3 }}>
          <UiLink asChild>
            <Link href="/legal/tokushoho">特定商取引法に基づく表記</Link>
          </UiLink>
        </Box>
      </Box>
    </Container>
  );
}
