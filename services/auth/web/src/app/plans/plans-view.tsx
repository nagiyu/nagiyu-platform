import Link from 'next/link';
import { Box, Card, CardContent, Container, Typography } from '@mui/material';
import { Button, Chip, Link as UiLink } from '@nagiyu/ui';
import { buildSignInPath } from '@/lib/billing-urls';
import type { PlansPageData } from '@/lib/plans-data';
import { PLANS_MESSAGES, type PlanService, type PlanTier } from '@/lib/plans';
import { DowngradeButton, PlanActionButton, ScheduledChangeCancelButton } from './plan-actions';

interface PlansViewProps {
  /** 課金が無効で読めないときは null */
  data: PlansPageData | null;
  callbackUrl: string | null;
  /** 新規の申し込みを始めてよいか。false のとき申し込みの導線を出さない */
  checkoutAllowed: boolean;
}

function PlanTierCard({
  tier,
  serviceId,
  callbackUrl,
  checkoutAllowed,
}: {
  tier: PlanTier;
  serviceId: string;
  callbackUrl: string | null;
  checkoutAllowed: boolean;
}) {
  return (
    <Card component="section" aria-label={tier.name} sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" component="h3">
            {tier.name}
          </Typography>
          {tier.state === 'subscribed' && <Chip size="sm">契約中</Chip>}
          {tier.state === 'canceling' && <Chip size="sm">解約予約中</Chip>}
        </Box>
        {tier.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tier.description}
          </Typography>
        )}
        {(tier.priceLabel || tier.priceFetchFailed) && (
          <Typography variant="h5" component="p" sx={{ mt: 2 }}>
            {tier.priceLabel ?? PLANS_MESSAGES.PRICE_UNAVAILABLE}
          </Typography>
        )}
        {tier.stateLabel && (
          <Typography variant="body1" sx={{ mt: 1 }}>
            {tier.stateLabel}
          </Typography>
        )}
        {tier.scheduledChangeLabel && (
          <Typography variant="body1" sx={{ mt: 1 }}>
            {tier.scheduledChangeLabel}
          </Typography>
        )}
        {tier.paymentPastDueLabel && (
          <Typography variant="body1" sx={{ mt: 1 }}>
            {tier.paymentPastDueLabel}
          </Typography>
        )}
        {tier.manualLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tier.manualLabel}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          {checkoutAllowed && tier.action === 'sign-in' && (
            <Button asChild variant="solid">
              <Link href={buildSignInPath(callbackUrl)}>ログインして申し込む</Link>
            </Button>
          )}
          {checkoutAllowed && tier.action === 'subscribe' && (
            <PlanActionButton
              endpoint="/api/billing/checkout"
              body={{ roleId: tier.roleId, ...(callbackUrl ? { callbackUrl } : {}) }}
              label="申し込む"
            />
          )}
          {tier.action === 'upgrade' && (
            <PlanActionButton
              endpoint="/api/billing/plan-change"
              body={{ roleId: tier.roleId, ...(callbackUrl ? { callbackUrl } : {}) }}
              label="この段に変える"
            />
          )}
          {tier.action === 'downgrade' && tier.downgradeConfirmMessage && (
            <DowngradeButton
              roleId={tier.roleId}
              callbackUrl={callbackUrl}
              confirmMessage={tier.downgradeConfirmMessage}
              label="この段に変える"
            />
          )}
          {tier.scheduledChangeLabel && <ScheduledChangeCancelButton serviceId={serviceId} />}
        </Box>
      </CardContent>
    </Card>
  );
}

function PlanServiceSection({
  service,
  callbackUrl,
  checkoutAllowed,
}: {
  service: PlanService;
  callbackUrl: string | null;
  checkoutAllowed: boolean;
}) {
  return (
    <Box component="section" aria-label={service.name}>
      <Typography variant="h5" component="h2">
        {service.name}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          mt: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fit, minmax(240px, 1fr))' },
        }}
      >
        {service.tiers.map((tier) => (
          <PlanTierCard
            key={tier.roleId}
            tier={tier}
            serviceId={service.serviceId}
            callbackUrl={callbackUrl}
            checkoutAllowed={checkoutAllowed}
          />
        ))}
      </Box>
    </Box>
  );
}

/** プランの画面の描画。データは props で受け、取得や認証は持たない */
export function PlansView({ data, callbackUrl, checkoutAllowed }: PlansViewProps) {
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          プラン
        </Typography>

        {!data || !data.billingEnabled || (data.services.length === 0 && !data.hasCustomer) ? (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            {PLANS_MESSAGES.PREPARING}
          </Typography>
        ) : (
          <>
            {data.services.length === 0 ? (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                {PLANS_MESSAGES.PREPARING}
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 4, mt: 2 }}>
                {!checkoutAllowed && (
                  <Typography variant="body1" role="note">
                    {PLANS_MESSAGES.CHECKOUT_RESTRICTED}
                  </Typography>
                )}
                {data.services.map((service) => (
                  <PlanServiceSection
                    key={service.serviceId}
                    service={service}
                    callbackUrl={callbackUrl}
                    checkoutAllowed={checkoutAllowed}
                  />
                ))}
              </Box>
            )}

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
