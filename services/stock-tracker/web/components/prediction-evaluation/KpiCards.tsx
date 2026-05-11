'use client';

import { Box, Card, CardContent, Typography } from '@mui/material';
import type { KpiSummary } from '@/lib/prediction-evaluation/types';

export interface KpiCardsProps {
  kpi: KpiSummary;
}

const NA = '—';

export const formatPercent = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return NA;
  }
  return `${value.toFixed(1)}%`;
};

export const formatCount = (value: number): string => value.toLocaleString('ja-JP');

interface KpiCardItem {
  key: string;
  label: string;
  value: string;
  description: string;
}

export const buildKpiItems = (kpi: KpiSummary): KpiCardItem[] => [
  {
    key: 'total-accuracy',
    label: '総合精度',
    value: formatPercent(kpi.totalAccuracy),
    description: '全シグナルの的中率',
  },
  {
    key: 'directional-accuracy',
    label: '方向精度',
    value: formatPercent(kpi.directionalAccuracy),
    description: 'BULLISH / BEARISH のみ',
  },
  {
    key: 'neutral-ratio',
    label: 'NEUTRAL 比率',
    value: formatPercent(kpi.neutralRatio),
    description: 'NEUTRAL 予測の割合',
  },
  {
    key: 'judged-count',
    label: '判定済み件数',
    value: formatCount(kpi.judgedCount),
    description: '採点済みの予測数',
  },
  {
    key: 'ai-failure-count',
    label: 'AI 失敗件数',
    value: formatCount(kpi.aiFailureCount),
    description: '採点対象外（解析失敗）',
  },
];

export default function KpiCards({ kpi }: KpiCardsProps) {
  const items = buildKpiItems(kpi);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
          md: 'repeat(5, 1fr)',
        },
        gap: 2,
      }}
      role="region"
      aria-label="KPI 一覧"
    >
      {items.map((item) => (
        <Card key={item.key} variant="outlined" data-testid={`kpi-card-${item.key}`}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              {item.label}
            </Typography>
            <Typography
              variant="h5"
              component="div"
              sx={{ fontWeight: 'bold', mt: 1 }}
              data-testid={`kpi-value-${item.key}`}
            >
              {item.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {item.description}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
