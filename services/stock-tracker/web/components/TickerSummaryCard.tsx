'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import type { TickerSummary } from '@/types/stock';
import { ERROR_MESSAGES } from '@/lib/error-messages';
import SummaryDetailDialog from './SummaryDetailDialog';

const INVESTMENT_SIGNAL_LABELS = {
  BULLISH: '強気',
  NEUTRAL: '中立',
  BEARISH: '弱気',
} as const;

interface TickerSummaryCardProps {
  summary: TickerSummary | null;
  loading: boolean;
  error: string;
}

export default function TickerSummaryCard({ summary, loading, error }: TickerSummaryCardProps) {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const supportLevels = useMemo(() => summary?.aiAnalysisResult?.supportLevels ?? [], [summary]);
  const resistanceLevels = useMemo(
    () => summary?.aiAnalysisResult?.resistanceLevels ?? [],
    [summary]
  );
  const investmentJudgment = summary?.aiAnalysisResult?.investmentJudgment?.signal
    ? INVESTMENT_SIGNAL_LABELS[summary.aiAnalysisResult.investmentJudgment.signal]
    : '未生成';
  const aiJudgmentMessage = summary?.aiAnalysisResult
    ? `${investmentJudgment}（${summary.aiAnalysisResult.investmentJudgment.reason}）`
    : typeof summary?.aiAnalysisError === 'string'
      ? ERROR_MESSAGES.AI_ANALYSIS_FAILED
      : ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;

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
            <Grid size={6}>
              <Typography variant="body2">投資判断: {investmentJudgment}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">買いシグナル: {summary.buyPatternCount ?? 0}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">売りシグナル: {summary.sellPatternCount ?? 0}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">AI判定: {aiJudgmentMessage}</Typography>
            </Grid>
            {supportLevels.length > 0 && (
              <Grid size={12}>
                <Typography variant="body2">サポートレベル: {supportLevels.join(', ')}</Typography>
              </Grid>
            )}
            {resistanceLevels.length > 0 && (
              <Grid size={12}>
                <Typography variant="body2">
                  レジスタンスレベル: {resistanceLevels.join(', ')}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                更新: {new Date(summary.updatedAt).toLocaleString('ja-JP')}
              </Typography>
            </Grid>
            <Grid size={12}>
              <Button variant="outlined" size="small" onClick={() => setIsDetailDialogOpen(true)}>
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
          />
        )}
      </CardContent>
    </Card>
  );
}
