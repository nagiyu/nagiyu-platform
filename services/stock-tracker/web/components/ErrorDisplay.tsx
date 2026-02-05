'use client';

/**
 * ErrorDisplay Component
 *
 * エラー状態を表示し、リトライ機能を提供するコンポーネント
 */

import React from 'react';
import { Box, Alert, Button, Typography } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import type { APIError } from '@nagiyu/common';

/**
 * ErrorDisplay Props
 */
interface ErrorDisplayProps {
  error: APIError | Error | string | null;
  onRetry?: () => void;
  showRetryButton?: boolean;
  fullWidth?: boolean;
}

/**
 * ErrorDisplay Component
 *
 * APIエラーを表示し、リトライボタンを提供
 */
export function ErrorDisplay({
  error,
  onRetry,
  showRetryButton = true,
  fullWidth = false,
}: ErrorDisplayProps) {
  if (!error) {
    return null;
  }

  // エラーメッセージの取得
  let errorMessage: string;
  let errorDetails: string[] | undefined;
  let shouldRetry = false;

  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    if ('errorInfo' in error) {
      const apiError = error as APIError;
      errorDetails = apiError.errorInfo.details;
      shouldRetry = apiError.errorInfo.shouldRetry ?? false;
    }
  } else {
    errorMessage = 'エラーが発生しました';
  }

  // リトライボタンを表示するかどうか
  const showRetry = showRetryButton && shouldRetry && onRetry;

  return (
    <Box sx={{ width: fullWidth ? '100%' : 'auto', maxWidth: 800, mx: 'auto' }}>
      <Alert severity="error" sx={{ mb: showRetry ? 2 : 0 }}>
        <Typography variant="body1" gutterBottom={!!errorDetails}>
          {errorMessage}
        </Typography>
        {errorDetails && errorDetails.length > 0 && (
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            {errorDetails.map((detail, index) => (
              <li key={index}>
                <Typography variant="body2">{detail}</Typography>
              </li>
            ))}
          </Box>
        )}
      </Alert>

      {showRetry && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={onRetry}>
            再試行
          </Button>
        </Box>
      )}
    </Box>
  );
}

/**
 * LoadingError Component
 *
 * データ取得エラーを表示する軽量版コンポーネント
 */
interface LoadingErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function LoadingError({
  message = 'データの読み込みに失敗しました',
  onRetry,
}: LoadingErrorProps) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto', mb: onRetry ? 2 : 0 }}>
        {message}
      </Alert>
      {onRetry && (
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRetry} sx={{ mt: 2 }}>
          再読み込み
        </Button>
      )}
    </Box>
  );
}
