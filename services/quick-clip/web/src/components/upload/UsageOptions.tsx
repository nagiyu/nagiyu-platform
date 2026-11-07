import { Alert, Box, FormControlLabel, Switch, Typography } from '@mui/material';
import {
  USAGE_MESSAGES,
  formatRemaining,
  hasHigherTier,
  resolveAiUnavailableMessage,
  type LimitGuidance,
  type UsageSummary,
} from '@/lib/usage-guidance';
import { LimitGuidanceActions } from './LimitGuidanceActions';

type UsageOptionsProps = {
  usage: UsageSummary;
  aiAnalysis: boolean;
  disabled: boolean;
  onAiAnalysisChange: (value: boolean) => void;
  signInHref: string;
  plansHref: string;
};

/** AI 解析の有無の選択と、今月の残り回数。AI ありが選べないときは理由と案内を添える */
export function UsageOptions({
  usage,
  aiAnalysis,
  disabled,
  onAiAnalysisChange,
  signInHref,
  plansHref,
}: UsageOptionsProps) {
  const unavailableMessage = resolveAiUnavailableMessage(usage);
  const guidance: LimitGuidance =
    unavailableMessage === null
      ? { plans: false, signIn: false }
      : {
          plans: usage.tier !== 'anonymous' && hasHigherTier(usage.tier),
          signIn: usage.tier === 'anonymous',
        };

  return (
    <Box sx={{ mb: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={aiAnalysis}
            disabled={disabled || unavailableMessage !== null}
            onChange={(event) => onAiAnalysisChange(event.target.checked)}
          />
        }
        label={USAGE_MESSAGES.AI_LABEL}
      />
      <Typography variant="body2" color="text.secondary">
        {formatRemaining(usage)}
      </Typography>
      {unavailableMessage !== null && (
        <>
          <Alert severity="info" sx={{ my: 1 }}>
            {unavailableMessage}
          </Alert>
          <LimitGuidanceActions guidance={guidance} signInHref={signInHref} plansHref={plansHref} />
        </>
      )}
    </Box>
  );
}
