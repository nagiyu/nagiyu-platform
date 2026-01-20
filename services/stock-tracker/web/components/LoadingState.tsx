'use client';

import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * ローディング状態コンポーネントのプロパティ
 */
export interface LoadingStateProps {
  /**
   * ローディングメッセージ
   */
  message?: string;
  /**
   * 最小高さ
   */
  minHeight?: number | string;
  /**
   * サイズ（CircularProgressのサイズ）
   */
  size?: number;
}

/**
 * ローディング状態コンポーネント
 *
 * 統一されたローディング表示を提供します。
 * アクセシビリティ対応として、role="status"とaria-live="polite"を設定しています。
 */
export default function LoadingState({
  message = '読み込み中...',
  minHeight = 400,
  size = 40,
}: LoadingStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: minHeight,
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CircularProgress size={size} aria-label={message} />
      {message && (
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mt: 2 }}
          aria-live="polite"
        >
          {message}
        </Typography>
      )}
    </Box>
  );
}
