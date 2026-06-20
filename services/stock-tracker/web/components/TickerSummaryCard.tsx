'use client';

import { useMemo, useState } from 'react';
import { Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import type { TickerSummary } from '@/types/stock';
import SummaryDetailDialog from './SummaryDetailDialog';
import { formatPredictedReturn, formatConfidence } from '@/lib/ai-analysis-format';

const INVESTMENT_SIGNAL_LABELS = {
  BULLISH: '強気',
  NEUTRAL: '中立',
  BEARISH: '弱気',
} as const;

/** 投資シグナルに対応する Chip カラー */
const INVESTMENT_SIGNAL_COLORS = {
  BULLISH: 'success',
  BEARISH: 'danger',
  NEUTRAL: 'neutral',
} as const satisfies Record<keyof typeof INVESTMENT_SIGNAL_LABELS, string>;

interface TickerSummaryCardProps {
  summary: TickerSummary | null;
  loading: boolean;
  error: string;
  onChanged: () => Promise<void>;
}

export default function TickerSummaryCard({
  summary,
  loading,
  error,
  onChanged,
}: TickerSummaryCardProps) {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const supportLevels = useMemo(() => summary?.aiAnalysisResult?.supportLevels ?? [], [summary]);
  const resistanceLevels = useMemo(
    () => summary?.aiAnalysisResult?.resistanceLevels ?? [],
    [summary]
  );
  /** signal が存在する場合のみラベルを返す。未生成は null */
  const investmentSignal = useMemo(
    () => summary?.aiAnalysisResult?.investmentJudgment?.signal ?? null,
    [summary]
  );

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          サマリー
        </Typography>
        {loading && <CircularProgress size={24} />}
        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {!loading && !error && !summary && (
          <Typography variant="body2" color="text.secondary">
            サマリー情報がありません
          </Typography>
        )}
        {!loading && !error && summary && (
          <Grid container spacing={1}>
            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">投資判断:</Typography>
                {investmentSignal !== null ? (
                  <Chip
                    color={INVESTMENT_SIGNAL_COLORS[investmentSignal]}
                    size="sm"
                    data-testid="summary-investment-signal"
                  >
                    {INVESTMENT_SIGNAL_LABELS[investmentSignal]}
                  </Chip>
                ) : (
                  <Typography variant="body2" data-testid="summary-investment-signal-unset">
                    未生成
                  </Typography>
                )}
              </Box>
              {typeof summary.aiAnalysisResult?.investmentJudgment?.predictedReturn ===
                'number' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    予測リターン:
                  </Typography>
                  <Typography variant="body2" data-testid="summary-predicted-return">
                    {formatPredictedReturn(
                      summary.aiAnalysisResult.investmentJudgment.predictedReturn
                    )}
                  </Typography>
                </Box>
              )}
              {typeof summary.aiAnalysisResult?.investmentJudgment?.confidence === 'number' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    確信度:
                  </Typography>
                  <Typography variant="body2" data-testid="summary-confidence">
                    {formatConfidence(summary.aiAnalysisResult.investmentJudgment.confidence)}
                  </Typography>
                </Box>
              )}
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">買いシグナル: {summary.buyPatternCount ?? 0}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">売りシグナル: {summary.sellPatternCount ?? 0}</Typography>
            </Grid>
            {supportLevels.length > 0 && (
              <Grid size={12}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  サポートレベル
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {supportLevels.map((level, index) => (
                    <Chip
                      key={`support-${summary.tickerId}-${level}-${String(index + 1)}`}
                      size="sm"
                    >
                      {`${level}`}
                    </Chip>
                  ))}
                </Box>
              </Grid>
            )}
            {resistanceLevels.length > 0 && (
              <Grid size={12}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  レジスタンスレベル
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {resistanceLevels.map((level, index) => (
                    <Chip
                      key={`resistance-${summary.tickerId}-${level}-${String(index + 1)}`}
                      size="sm"
                    >
                      {`${level}`}
                    </Chip>
                  ))}
                </Box>
              </Grid>
            )}
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                更新: {new Date(summary.updatedAt).toLocaleString('ja-JP')}
              </Typography>
            </Grid>
            <Grid size={12}>
              <Button variant="outline" size="sm" onClick={() => setIsDetailDialogOpen(true)}>
                詳細
              </Button>
            </Grid>
          </Grid>
        )}
        {!loading && !error && summary && (
          <SummaryDetailDialog
            open={isDetailDialogOpen}
            summary={summary}
            onClose={() => setIsDetailDialogOpen(false)}
            onAlertChanged={onChanged}
          />
        )}
      </CardContent>
    </Card>
  );
}
