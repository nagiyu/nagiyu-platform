'use client';

import { Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import type { TickerSummary } from '@/types/stock';

interface TickerSummaryCardProps {
  summary: TickerSummary | null;
  loading: boolean;
  error: string;
}

export default function TickerSummaryCard({ summary, loading, error }: TickerSummaryCardProps) {
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
              <Typography variant="body2">始値: {summary.open.toLocaleString()}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">終値: {summary.close.toLocaleString()}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">高値: {summary.high.toLocaleString()}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">安値: {summary.low.toLocaleString()}</Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="body2">出来高: {(summary.volume ?? 0).toLocaleString()}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">買いシグナル: {summary.buyPatternCount}</Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2">売りシグナル: {summary.sellPatternCount}</Typography>
            </Grid>
            {summary.aiAnalysisResult?.investmentJudgment?.signal && (
              <Grid size={12}>
                <Typography variant="body2">
                  AI判定: {summary.aiAnalysisResult.investmentJudgment.signal}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                更新: {new Date(summary.updatedAt).toLocaleString('ja-JP')}
              </Typography>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
