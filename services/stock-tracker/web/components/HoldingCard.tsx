'use client';

import { Card, CardContent, CircularProgress, Typography } from '@mui/material';
import type { HoldingResponse } from '@/types/holding';

interface HoldingCardProps {
  holding: HoldingResponse | null;
  loading: boolean;
  error: string;
}

export default function HoldingCard({ holding, loading, error }: HoldingCardProps) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          保有株式
        </Typography>
        {loading && <CircularProgress size={24} />}
        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {!loading && !error && !holding && (
          <Typography variant="body2" color="text.secondary">
            保有なし
          </Typography>
        )}
        {!loading && !error && holding && (
          <>
            <Typography variant="body2">保有数量: {holding.quantity.toLocaleString()}</Typography>
            <Typography variant="body2">
              平均取得価格: {holding.averagePrice.toLocaleString()}
            </Typography>
            <Typography variant="body2">通貨: {holding.currency}</Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
