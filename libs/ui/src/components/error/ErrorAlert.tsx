'use client';

import { Refresh as RefreshIcon } from '@mui/icons-material';
import { Alert, AlertTitle, Box, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { APIError } from '@nagiyu/common';

import Button from '../Button';

/**
 * ErrorAlert で受け付けるエラー値の型
 */
export type ErrorAlertError = string | Error | APIError | null | undefined;

/**
 * エラーアラートコンポーネントのプロパティ
 *
 * 表示メッセージは以下のいずれかから決定する（message が優先）:
 * - message: 文字列メッセージ
 * - error: string / Error / APIError
 *   APIError の場合、errorInfo.details / shouldRetry も自動で利用する
 */
export interface ErrorAlertProps {
  /**
   * エラーメッセージ（指定時は error より優先）
   */
  message?: string;
  /**
   * エラーオブジェクト（string / Error / APIError）
   */
  error?: ErrorAlertError;
  /**
   * エラーのタイトル（省略可能）
   */
  title?: string;
  /**
   * 詳細リスト（明示指定。未指定でも APIError なら errorInfo.details を表示する）
   */
  details?: string[];
  /**
   * リトライコールバック。指定時にリトライボタンを表示する。
   * APIError で errorInfo.shouldRetry === false の場合は表示しない。
   */
  onRetry?: () => void;
  /**
   * リトライボタンのラベル（デフォルト: '再試行'）
   */
  retryLabel?: string;
  /**
   * 閉じるコールバック。指定時にアラートに ✕ ボタンを表示する。
   */
  onClose?: () => void;
  /**
   * MUI sx props
   */
  sx?: SxProps<Theme>;
  /**
   * エラーの重大度（デフォルト: 'error'）
   */
  severity?: 'error' | 'warning' | 'info';
}

interface ResolvedError {
  message: string;
  details?: string[];
  canRetry: boolean;
}

function resolveError(args: { message?: string; error?: ErrorAlertError }): ResolvedError | null {
  const { message, error } = args;
  if (message) {
    return { message, canRetry: true };
  }
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return { message: error, canRetry: true };
  }
  if (error instanceof APIError) {
    return {
      message: error.errorInfo.message || error.message || 'エラーが発生しました',
      details: error.errorInfo.details,
      canRetry: error.errorInfo.shouldRetry !== false,
    };
  }
  return {
    message: error.message || 'エラーが発生しました',
    canRetry: true,
  };
}

/**
 * エラーアラートコンポーネント
 *
 * 統一されたエラー表示を提供する。
 * アクセシビリティ対応として、role="alert" と aria-live="assertive" を設定している。
 */
export default function ErrorAlert({
  message,
  error,
  title,
  details,
  onRetry,
  retryLabel = '再試行',
  onClose,
  sx,
  severity = 'error',
}: ErrorAlertProps) {
  const resolved = resolveError({ message, error });
  if (!resolved) {
    return null;
  }

  const displayDetails = details ?? resolved.details;
  const hasDetails = displayDetails !== undefined && displayDetails.length > 0;
  const showRetry = onRetry !== undefined && resolved.canRetry;

  const alertElement = (
    <Alert
      severity={severity}
      onClose={onClose}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      sx={showRetry ? { mb: 2 } : { mb: 2, ...sx }}
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      {hasDetails ? (
        <>
          <Typography variant="body2" gutterBottom>
            {resolved.message}
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            {displayDetails!.map((detail, index) => (
              <li key={index}>
                <Typography variant="body2">{detail}</Typography>
              </li>
            ))}
          </Box>
        </>
      ) : (
        resolved.message
      )}
    </Alert>
  );

  if (!showRetry) {
    return alertElement;
  }

  return (
    <Box sx={sx}>
      {alertElement}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Button variant="solid" startIcon={<RefreshIcon />} onClick={onRetry}>
          {retryLabel}
        </Button>
      </Box>
    </Box>
  );
}
