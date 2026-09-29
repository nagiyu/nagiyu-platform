'use client';

import { useState } from 'react';
import { Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import type { TickerSummary } from '@/types/stock';
import SummaryDetailDialog from './SummaryDetailDialog';
import ForecastLabelChip from './ForecastLabelChip';
import {
  formatLit,
  formatProbabilityWithUsual,
  formatReferenceDate,
  resolveUnavailableReason,
} from '@/lib/forecast-view/labels';

interface TickerSummaryCardProps {
  summary: TickerSummary | null;
  loading: boolean;
  error: string;
  onChanged: () => Promise<void>;
}

/** トップ画面のサマリーパネル。確度の要約だけを出し、詳細はダイアログで見せる */
export default function TickerSummaryCard({
  summary,
  loading,
  error,
  onChanged,
}: TickerSummaryCardProps) {
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const referenceDate = summary ? formatReferenceDate(summary.date) : null;

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
            {referenceDate && (
              <Grid size={12}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid="summary-reference-date"
                >
                  {referenceDate}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2">方向:</Typography>
                <ForecastLabelChip
                  question="DIR"
                  view={summary.forecast?.dir}
                  unavailableReason={resolveUnavailableReason('DIR', summary.forecast)}
                  data-testid="summary-dir-label"
                />
                {summary.forecast?.dir && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    data-testid="summary-dir-probability"
                  >
                    {formatProbabilityWithUsual('DIR', summary.forecast.dir)}
                  </Typography>
                )}
              </Box>
            </Grid>
            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2">荒れ:</Typography>
                <ForecastLabelChip
                  question="VOL"
                  view={summary.forecast?.vol}
                  unavailableReason={resolveUnavailableReason('VOL', summary.forecast)}
                  data-testid="summary-vol-label"
                />
                {summary.forecast?.vol && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    data-testid="summary-vol-probability"
                  >
                    {formatProbabilityWithUsual('VOL', summary.forecast.vol)}
                  </Typography>
                )}
              </Box>
            </Grid>
            <Grid size={12}>
              <Typography variant="body2" data-testid="summary-lit">
                点灯: {formatLit(summary.forecast?.lit)}
              </Typography>
            </Grid>
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
