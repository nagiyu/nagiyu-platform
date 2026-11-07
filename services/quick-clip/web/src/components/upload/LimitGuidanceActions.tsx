import { Stack } from '@mui/material';
import { Button } from '@nagiyu/ui';
import { USAGE_MESSAGES, type LimitGuidance } from '@/lib/usage-guidance';

type LimitGuidanceActionsProps = {
  guidance: LimitGuidance;
  signInHref: string;
  plansHref: string;
};

/** 上限のときの誘導先 (ログイン・プランの画面) へのボタン。案内が無ければ何も出さない */
export function LimitGuidanceActions({
  guidance,
  signInHref,
  plansHref,
}: LimitGuidanceActionsProps) {
  if (!guidance.signIn && !guidance.plans) {
    return null;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
      {guidance.signIn && (
        <Button asChild variant="solid">
          <a href={signInHref}>{USAGE_MESSAGES.SIGN_IN_ACTION}</a>
        </Button>
      )}
      {guidance.plans && (
        <Button asChild variant={guidance.signIn ? 'outline' : 'solid'}>
          <a href={plansHref}>{USAGE_MESSAGES.PLANS_ACTION}</a>
        </Button>
      )}
    </Stack>
  );
}
