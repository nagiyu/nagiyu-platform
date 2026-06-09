'use client';

import { Suspense, useState } from 'react';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { ErrorAlert, LoadingState } from '@nagiyu/ui';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@nagiyu/common';
import PeriodSelector from '@/components/prediction-evaluation/PeriodSelector';
import ThresholdSelector from '@/components/prediction-evaluation/ThresholdSelector';
import DailyTrendChart from '@/components/prediction-evaluation/DailyTrendChart';
import SignalAccuracyChart from '@/components/prediction-evaluation/SignalAccuracyChart';
import { usePredictionEvaluationSummary } from '@/lib/prediction-evaluation/use-prediction-evaluation';
import {
  buildLoadingHeadline,
  buildSummaryHeadline,
} from '@/lib/prediction-evaluation/summary-headline';
import type { EvaluationPeriod } from '@/lib/prediction-evaluation/types';

const DEFAULT_PERIOD: EvaluationPeriod = '30d';
const DEFAULT_THRESHOLD = 0.5;

const UNAUTHORIZED_MESSAGE = '予測精度ダッシュボードを表示する権限がありません。';

function PredictionEvaluationContent() {
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<EvaluationPeriod>(DEFAULT_PERIOD);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);

  const summary = usePredictionEvaluationSummary(period, threshold);

  if (status === 'loading') {
    return <LoadingState message="セッション情報を確認中..." />;
  }

  const hasReadPermission =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:read-evaluation');

  if (!hasReadPermission) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }} role="main">
        <ErrorAlert message={UNAUTHORIZED_MESSAGE} title="権限エラー" />
      </Container>
    );
  }

  const headline = summary.data
    ? buildSummaryHeadline(period, summary.data.kpi)
    : buildLoadingHeadline(period);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }} role="main">
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
          予測精度ダッシュボード
        </Typography>
        <Typography
          variant="subtitle1"
          color="text.secondary"
          data-testid="summary-headline"
          sx={{ mb: 2 }}
        >
          {headline}
        </Typography>
      </Box>

      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <PeriodSelector value={period} onChange={setPeriod} />
        <ThresholdSelector value={threshold} onChange={setThreshold} />
      </Box>

      {summary.error && <ErrorAlert message={summary.error} />}

      {summary.loading || !summary.data ? (
        <LoadingState message="集計サマリーを読み込み中..." />
      ) : summary.data.kpi.judgedCount === 0 ? null : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <DailyTrendChart data={summary.data.dailyTrend} />
          <SignalAccuracyChart data={summary.data.bySignal} />
        </Box>
      )}
    </Container>
  );
}

export default function PredictionEvaluationPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        </Container>
      }
    >
      <PredictionEvaluationContent />
    </Suspense>
  );
}
