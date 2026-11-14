import { Alert, Box, FormControlLabel, Switch, Typography } from '@mui/material';
import {
  USAGE_MESSAGES,
  formatRemaining,
  hasAiRemaining,
  resolveUsageNotice,
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

/** AI 解析の有無の選択と、今月の残り回数。回数が尽きて送れない・AI ありが選べないときは理由と案内を添える */
export function UsageOptions({
  usage,
  aiAnalysis,
  disabled,
  onAiAnalysisChange,
  signInHref,
  plansHref,
}: UsageOptionsProps) {
  const notice = resolveUsageNotice(usage, aiAnalysis);

  return (
    <Box sx={{ mb: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={aiAnalysis}
            disabled={disabled || !hasAiRemaining(usage)}
            onChange={(event) => onAiAnalysisChange(event.target.checked)}
          />
        }
        label={USAGE_MESSAGES.AI_LABEL}
      />
      <Typography variant="body2" color="text.secondary">
        {formatRemaining(usage)}
      </Typography>
      {notice !== null && (
        <>
          <Alert severity="info" sx={{ my: 1 }}>
            {notice.message}
          </Alert>
          <LimitGuidanceActions
            guidance={notice.guidance}
            signInHref={signInHref}
            plansHref={plansHref}
          />
        </>
      )}
    </Box>
  );
}
