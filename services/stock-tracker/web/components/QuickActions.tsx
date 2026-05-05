'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';
import {
  TrendingUp as TrendingUpIcon,
  Notifications as NotificationsIcon,
  Business as BusinessIcon,
  ShowChart as ShowChartIcon,
  Summarize as SummarizeIcon,
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
        <Button asChild variant="solid" size="lg">
          <Link href="/holdings">
            <TrendingUpIcon />
            保有株式管理
          </Link>
        </Button>

        {/* 2. アラート一覧 */}
        <Button asChild variant="solid" size="lg">
          <Link href="/alerts">
            <NotificationsIcon />
            アラート一覧
          </Link>
        </Button>

        <Button asChild variant="solid" size="lg">
          <Link href="/summaries">
            <SummarizeIcon />
            サマリー
          </Link>
        </Button>

        {/* 4. 取引所管理 (stock-admin のみ) */}
        {hasManageDataPermission && (
          <Button asChild variant="outline" size="lg">
            <Link href="/exchanges">
              <BusinessIcon />
              取引所管理
            </Link>
          </Button>
        )}

        {/* 5. ティッカー管理 (stock-admin のみ) */}
        {hasManageDataPermission && (
          <Button asChild variant="outline" size="lg">
            <Link href="/tickers">
              <ShowChartIcon />
              ティッカー管理
            </Link>
          </Button>
        )}
      </Box>
    </Box>
  );
}
