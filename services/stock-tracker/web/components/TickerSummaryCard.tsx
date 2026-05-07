'use client';

import { useMemo, useState } from 'react';
import { Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import { Button, Chip } from '@nagiyu/ui';
import type { TickerSummary } from '@/types/stock';
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
  const investmentJudgment = useMemo(
    () =>
      summary?.aiAnalysisResult?.investmentJudgment?.signal
        ? INVESTMENT_SIGNAL_LABELS[summary.aiAnalysisResult.investmentJudgment.signal]
        : '未生成',
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
              <Typography variant="body2">投資判断: {investmentJudgment}</Typography>
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
