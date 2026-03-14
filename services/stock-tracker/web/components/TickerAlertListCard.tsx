'use client';

import { Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type { AlertResponse } from '@/types/alert';

interface TickerAlertListCardProps {
  alerts: AlertResponse[];
  loading: boolean;
  error: string;
}

const OPERATOR_LABELS: Record<string, string> = {
  gte: '以上',
  lte: '以下',
};

export default function TickerAlertListCard({ alerts, loading, error }: TickerAlertListCardProps) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          アラート
        </Typography>
        {loading && <CircularProgress size={24} />}
        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {!loading && !error && alerts.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            アラートなし
          </Typography>
        )}
        {!loading && !error && alerts.length > 0 && (
          <Stack spacing={1}>
            {alerts.map((alert) => (
              <Stack
                key={alert.alertId}
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
              >
                <Chip
                  label={alert.mode === 'Buy' ? '買い' : '売り'}
                  size="small"
                  color={alert.mode === 'Buy' ? 'success' : 'warning'}
                />
                <Typography variant="body2">
                  {alert.conditions
                    .map(
                      (condition) =>
                        `${OPERATOR_LABELS[condition.operator] ?? condition.operator} ${condition.value}`
                    )
                    .join(', ')}
                </Typography>
                <Chip label={alert.enabled ? '有効' : '無効'} size="small" variant="outlined" />
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
