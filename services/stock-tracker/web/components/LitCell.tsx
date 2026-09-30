'use client';

import { Box, Typography } from '@mui/material';
import type { TickerForecastSummary } from '../types/forecast';
import { buildLitParts } from '../lib/forecast-view/labels';

interface LitCellProps {
  lit: TickerForecastSummary['lit'] | null | undefined;
}

/**
 * 一覧の点灯セル。
 * 合計を固定幅・右寄せにして、内訳の有無にかかわらず合計の位置をそろえる。
 */
export default function LitCell({ lit }: LitCellProps) {
  const { total, breakdown } = buildLitParts(lit);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}>
      <Typography
        component="span"
        variant="body2"
        sx={{ width: '2ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      >
        {total}
      </Typography>
      {/* 内訳の枠は常に確保し、内訳なしの行でも合計の位置を動かさない */}
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: '6em', textAlign: 'left' }}
      >
        {breakdown}
      </Typography>
    </Box>
  );
}
