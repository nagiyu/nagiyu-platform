'use client';

import { Box, Typography } from '@mui/material';
import { ReactNode } from 'react';

/**
 * 空状態コンポーネントのプロパティ
 */
export interface EmptyStateProps {
  /**
   * タイトル
   */
  title: string;
  /**
   * 説明文
   */
  description?: string;
  /**
   * アイコン（省略可能）
   */
  icon?: ReactNode;
  /**
   * 最小高さ
   */
  minHeight?: number | string;
}

/**
 * 空状態コンポーネント
 *
 * データが無い場合の統一された表示を提供します。
 */
export default function EmptyState({
  title,
  description,
  icon,
  minHeight = 400,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: minHeight,
      }}
      role="region"
      aria-label="空の状態"
    >
      {icon && (
        <Box sx={{ mb: 2, opacity: 0.5 }} aria-hidden="true">
          {icon}
        </Box>
      )}
      <Typography variant="h5" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body1"
          color="text.secondary"
          align="center"
          sx={{ mt: 2 }}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
}
