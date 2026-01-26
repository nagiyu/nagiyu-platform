'use client';

import { Box, Typography, Button } from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Visibility as VisibilityIcon,
  Notifications as NotificationsIcon,
  Business as BusinessIcon,
  ShowChart as ShowChartIcon,
} from '@mui/icons-material';

interface QuickActionsProps {
  hasManageDataPermission: boolean;
}

export default function QuickActions({ hasManageDataPermission }: QuickActionsProps) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        クイックアクション
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {/* 1. 保有株式管理 */}
        <Button
          variant="contained"
          size="large"
          href="/holdings"
          startIcon={<TrendingUpIcon />}
          sx={{ py: 2 }}
        >
          保有株式管理
        </Button>

        {/* 2. ウォッチリスト */}
        <Button
          variant="contained"
          size="large"
          href="/watchlist"
          startIcon={<VisibilityIcon />}
          sx={{ py: 2 }}
        >
          ウォッチリスト
        </Button>

        {/* 3. アラート一覧 */}
        <Button
          variant="contained"
          size="large"
          href="/alerts"
          startIcon={<NotificationsIcon />}
          sx={{ py: 2 }}
        >
          アラート一覧
        </Button>

        {/* 4. 取引所管理 (stock-admin のみ) */}
        {hasManageDataPermission && (
          <Button
            variant="outlined"
            size="large"
            href="/exchanges"
            startIcon={<BusinessIcon />}
            sx={{ py: 2 }}
          >
            取引所管理
          </Button>
        )}

        {/* 5. ティッカー管理 (stock-admin のみ) */}
        {hasManageDataPermission && (
          <Button
            variant="outlined"
            size="large"
            href="/tickers"
            startIcon={<ShowChartIcon />}
            sx={{ py: 2 }}
          >
            ティッカー管理
          </Button>
        )}
      </Box>
    </Box>
  );
}
