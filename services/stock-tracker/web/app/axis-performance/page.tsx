'use client';

import { Suspense, useState } from 'react';
import {
  Box,
  CircularProgress,
  Container,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ErrorAlert, LoadingState } from '@nagiyu/ui';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@nagiyu/common';
import AxisTable from '../../components/axis-performance/AxisTable';
import CalibrationSection from '../../components/axis-performance/CalibrationSection';
import {
  DEFAULT_MARKET,
  DEFAULT_PERIOD,
  EMPTY_MESSAGE,
  ERROR_MESSAGES,
  MARKETS,
  MARKET_LABELS,
  PERIODS,
  PERIOD_LABELS,
  QUESTIONS,
  QUESTION_LABELS,
} from '../../lib/axis-performance-view/constants';
import { buildHeadline, buildRangeText } from '../../lib/axis-performance-view/format';
import { normalizeMarket, parseInitialQuestion } from '../../lib/axis-performance-view/params';
import { useAxisPerformance } from '../../lib/axis-performance-view/use-axis-performance';
import type {
  AxisPerformanceMarket,
  AxisPerformancePeriod,
  ForecastQuestion,
} from '../../types/forecast';

function AxisPerformanceContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [question, setQuestion] = useState<ForecastQuestion>(() =>
    parseInitialQuestion(searchParams.get('question'))
  );
  const [period, setPeriod] = useState<AxisPerformancePeriod>(DEFAULT_PERIOD);
  const [market, setMarket] = useState<AxisPerformanceMarket>(() =>
    normalizeMarket(parseInitialQuestion(searchParams.get('question')), DEFAULT_MARKET)
  );

  const hasReadPermission =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:read');

  const performance = useAxisPerformance(question, period, market, hasReadPermission);

  if (status === 'loading') {
    return <LoadingState message="セッション情報を確認中..." />;
  }

  if (!hasReadPermission) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }} role="main">
        <ErrorAlert message={ERROR_MESSAGES.UNAUTHORIZED} title="権限エラー" />
      </Container>
    );
  }

  const handleQuestionChange = (next: ForecastQuestion) => {
    setQuestion(next);
    setMarket((current) => normalizeMarket(next, current));
  };

  const { data } = performance;
  const rangeText = data ? buildRangeText(data.from, data.to) : null;
  // 市場の荒れは JP / US を合算しないため、全体は選べない
  const marketOptions = MARKETS.filter((option) => !(question === 'MKT' && option === 'ALL'));

  return (
    <Container maxWidth="xl" sx={{ py: 3 }} role="main">
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 0.5 }}>
          判断軸の成績
        </Typography>
        <Typography
          variant="subtitle1"
          color="text.secondary"
          data-testid="axis-performance-headline"
        >
          {data ? buildHeadline(data) : '読み込み中...'}
        </Typography>
        {rangeText && (
          <Typography variant="caption" color="text.secondary" data-testid="axis-performance-range">
            {rangeText}
          </Typography>
        )}
      </Box>

      <Tabs
        value={question}
        onChange={(_event, value: ForecastQuestion) => handleQuestionChange(value)}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="問い"
        sx={{ mb: 2 }}
      >
        {QUESTIONS.map((value) => (
          <Tab key={value} value={value} label={QUESTION_LABELS[value]} />
        ))}
      </Tabs>

      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={period}
          aria-label="集計期間"
          onChange={(_event, value: AxisPerformancePeriod | null) => value && setPeriod(value)}
        >
          {PERIODS.map((value) => (
            <ToggleButton key={value} value={value}>
              {PERIOD_LABELS[value]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={market}
          aria-label="市場"
          onChange={(_event, value: AxisPerformanceMarket | null) => value && setMarket(value)}
        >
          {marketOptions.map((value) => (
            <ToggleButton key={value} value={value}>
              {MARKET_LABELS[value]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {performance.error && <ErrorAlert message={performance.error} />}

      {performance.loading || !data ? (
        performance.error ? null : (
          <LoadingState message="判断軸の成績を読み込み中..." />
        )
      ) : data.evaluatedCount === 0 ? (
        <Typography color="text.secondary" data-testid="axis-performance-empty">
          {EMPTY_MESSAGE}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <CalibrationSection calibration={data.calibration} neutralBand={data.neutralBand} />
          <AxisTable question={question} axes={data.axes} />
        </Box>
      )}
    </Container>
  );
}

export default function AxisPerformancePage() {
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
      <AxisPerformanceContent />
    </Suspense>
  );
}
